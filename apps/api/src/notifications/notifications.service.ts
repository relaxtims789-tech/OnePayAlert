import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Permission,
  RealtimeEvent,
  paymentAlertMessage,
  permissionsFor,
  type CompanyRole,
  type Locale,
  type TransactionDto,
  type TransactionStatus,
} from '@onepay/shared';
import { DevicesService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUSH_SENDER, type PushSender } from './push.sender';

/**
 * Fan-out of payment events to every channel: WebSocket (dashboards, app in foreground) and
 * FCM push (app in background) and soundboxes (MQTT).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    private readonly devices: DevicesService,
  ) {}

  async transactionChanged(
    kind: 'created' | 'updated',
    txn: TransactionDto,
    previousStatus: TransactionStatus | null,
  ): Promise<void> {
    this.realtime.emitTransaction(
      kind === 'created' ? RealtimeEvent.TRANSACTION_CREATED : RealtimeEvent.TRANSACTION_UPDATED,
      txn,
    );
    // Audible/visible "money received" alerts only when a payment becomes successful.
    const becameSuccessful = txn.status === 'SUCCESS' && previousStatus !== 'SUCCESS';
    if (becameSuccessful && txn.direction === 'CREDIT') {
      await Promise.all([
        this.pushPaymentAlert(txn),
        this.devices.announcePayment(txn).catch((e: unknown) => {
          this.logger.error(`Soundbox announcement for ${txn.id} failed: ${e instanceof Error ? e.message : String(e)}`);
          return 0;
        }),
      ]);
    }
  }

  /** Users who may see this transaction: active members with TRANSACTION_READ and outlet access. */
  async recipients(txn: Pick<TransactionDto, 'companyId' | 'outletId'>) {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId: txn.companyId, isActive: true, user: { status: 'ACTIVE' } },
      select: {
        role: true,
        outlets: { select: { outletId: true } },
        user: { select: { id: true, locale: true, pushTokens: { select: { token: true } } } },
      },
    });
    return memberships.filter((m) => {
      if (!permissionsFor(m.role as CompanyRole, null).includes(Permission.TRANSACTION_READ)) return false;
      if (m.outlets.length === 0) return true;
      return txn.outletId !== null && m.outlets.some((o) => o.outletId === txn.outletId);
    });
  }

  private async pushPaymentAlert(txn: TransactionDto): Promise<void> {
    const recipients = await this.recipients(txn);
    const outletName = txn.outletId
      ? ((await this.prisma.outlet.findUnique({ where: { id: txn.outletId }, select: { name: true } }))?.name ??
        null)
      : null;

    const byLocale = new Map<Locale, string[]>();
    for (const r of recipients) {
      const tokens = r.user.pushTokens.map((t) => t.token);
      if (tokens.length === 0) continue;
      const list = byLocale.get(r.user.locale) ?? [];
      list.push(...tokens);
      byLocale.set(r.user.locale, list);
    }

    for (const [locale, tokens] of byLocale) {
      const msg = paymentAlertMessage(locale, {
        amountMinor: txn.amountMinor,
        currency: txn.currency,
        payerName: txn.payerName,
        outletName,
      });
      const title = txn.isSimulated ? `[DEMO] ${msg.title}` : msg.title;
      try {
        // FCM multicast accepts up to 500 tokens per call.
        for (let i = 0; i < tokens.length; i += 500) {
          const batch = tokens.slice(i, i + 500);
          const res = await this.push.send({
            tokens: batch,
            title,
            body: msg.body,
            data: {
              type: 'payment.received',
              transactionId: txn.id,
              companyId: txn.companyId,
              amountMinor: String(txn.amountMinor),
              currency: txn.currency,
              isSimulated: String(txn.isSimulated),
            },
          });
          if (res.invalidTokens.length > 0) {
            await this.prisma.pushToken.deleteMany({ where: { token: { in: res.invalidTokens } } });
          }
        }
      } catch (e) {
        this.logger.error(`Push to ${tokens.length} device(s) failed: ${(e as Error).message}`);
      }
    }
  }
}
