import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import {
  DEVICE_SERIAL_PATTERN,
  DEVICE_TEST_TEXT,
  deviceMayAccess,
  deviceTopics,
  fromMinorUnits,
  paymentAlertMessage,
  type DeviceCommand,
  type DeviceCredentialsDto,
  type DeviceDto,
  type DeviceTestResultDto,
  type Locale,
  type Paginated,
  type PlatformDeviceDto,
  type TransactionDto,
} from '@onepay/shared';
import { Prisma, type Device } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { apiError } from '../common/api-error';
import type { AuthUser, TenantUser } from '../common/auth-user';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MQTT_BRIDGE, type MqttBridge } from './mqtt.bridge';

type DeviceWithCompany = Device & { company?: { name: string } | null };

export function toDeviceDto(d: Device): DeviceDto {
  return {
    id: d.id,
    serialNumber: d.serialNumber,
    model: d.model,
    name: d.name,
    outletId: d.outletId,
    status: d.status,
    locale: d.locale,
    volume: d.volume,
    online: d.online,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    firmware: d.firmware,
    batteryPct: d.batteryPct,
    signalDbm: d.signalDbm,
    claimedAt: d.claimedAt?.toISOString() ?? null,
  };
}

export function toPlatformDeviceDto(d: DeviceWithCompany): PlatformDeviceDto {
  return { ...toDeviceDto(d), companyId: d.companyId, companyName: d.company?.name ?? null, createdAt: d.createdAt.toISOString() };
}

/** Crockford-style alphabet without 0/O/1/I/L/U, printed as XXXX-XXXX. */
const CLAIM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newClaimCode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => CLAIM_ALPHABET[b % CLAIM_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}
/** Merchants may type the code with or without the dash, in any case, with stray spaces. */
export const normaliseClaimCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '');
const newMqttPassword = () => randomBytes(24).toString('base64url');

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface MqttAuthRequest {
  clientid?: string;
  username?: string;
  password?: string;
}
export interface MqttAclRequest {
  clientid?: string;
  username?: string;
  topic?: string;
  action?: string;
}
export type MqttHookResult = { result: 'allow' | 'deny'; is_superuser?: boolean };

@Injectable()
export class DevicesService implements OnModuleInit {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly realtime: RealtimeGateway,
    private readonly config: AppConfig,
    @Inject(MQTT_BRIDGE) private readonly mqtt: MqttBridge,
  ) {}

  onModuleInit(): void {
    this.mqtt.onDeviceMessage((topic, payload) => {
      this.handleDeviceMessage(topic, payload).catch((e: unknown) =>
        this.logger.warn(`Device message on ${topic} failed: ${e instanceof Error ? e.message : String(e)}`),
      );
    });
  }

  get mqttEnabled(): boolean {
    return this.mqtt.enabled;
  }

  // ───────────────────────── MysoftKH inventory ─────────────────────────

  async register(actor: AuthUser, serialNumber: string, model: string, ip: string | null): Promise<DeviceCredentialsDto> {
    const mqttPassword = newMqttPassword();
    const claimCode = newClaimCode();
    const device = await this.prisma.$transaction(async (tx) => {
      const d = await tx.device.create({
        data: {
          serialNumber,
          model,
          secretHash: await hash(mqttPassword),
          claimCodeHash: await hash(normaliseClaimCode(claimCode)),
        },
      });
      await this.audit.log(
        { companyId: null, actorUserId: actor.userId, action: 'platform.device.registered', entityType: 'device', entityId: d.id, metadata: { serialNumber, model }, ipAddress: ip },
        tx,
      );
      return d;
    });
    return { device: toPlatformDeviceDto(device), mqttUsername: serialNumber, mqttPassword, claimCode };
  }

  async listAll(q: { search?: string; status?: Device['status']; page: number; pageSize: number }): Promise<Paginated<PlatformDeviceDto>> {
    const where: Prisma.DeviceWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { serialNumber: { contains: q.search.toUpperCase() } },
              { name: { contains: q.search, mode: 'insensitive' } },
              { company: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        include: { company: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.device.count({ where }),
    ]);
    return { items: items.map(toPlatformDeviceDto), total, page: q.page, pageSize: q.pageSize };
  }

  async rotateSecret(actor: AuthUser, id: string, ip: string | null): Promise<DeviceCredentialsDto> {
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) throw apiError(HttpStatus.NOT_FOUND, 'DEVICE_NOT_FOUND');
    const mqttPassword = newMqttPassword();
    const device = await this.prisma.$transaction(async (tx) => {
      const d = await tx.device.update({ where: { id }, data: { secretHash: await hash(mqttPassword) }, include: { company: { select: { name: true } } } });
      await this.audit.log(
        { companyId: d.companyId, actorUserId: actor.userId, action: 'platform.device.secret_rotated', entityType: 'device', entityId: id, ipAddress: ip },
        tx,
      );
      return d;
    });
    return { device: toPlatformDeviceDto(device), mqttUsername: device.serialNumber, mqttPassword };
  }

  /** Disabling refuses the device's next MQTT login and stops all commands to it. */
  async setDisabled(actor: AuthUser, id: string, disabled: boolean, ip: string | null): Promise<PlatformDeviceDto> {
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) throw apiError(HttpStatus.NOT_FOUND, 'DEVICE_NOT_FOUND');
    const device = await this.prisma.$transaction(async (tx) => {
      if (!disabled && existing.companyId) await this.entitlements.assertCanAdd(tx, existing.companyId, 'devices');
      const d = await tx.device.update({
        where: { id },
        data: { status: disabled ? 'DISABLED' : existing.companyId ? 'ACTIVE' : 'UNASSIGNED', ...(disabled ? { online: false } : {}) },
        include: { company: { select: { name: true } } },
      });
      await this.audit.log(
        { companyId: d.companyId, actorUserId: actor.userId, action: disabled ? 'platform.device.disabled' : 'platform.device.enabled', entityType: 'device', entityId: id, ipAddress: ip },
        tx,
      );
      return d;
    });
    return toPlatformDeviceDto(device);
  }

  // ───────────────────────── Merchant ─────────────────────────

  /** Outlet-restricted staff only see the devices of their outlets. */
  private scope(user: TenantUser): Prisma.DeviceWhereInput {
    return { companyId: user.companyId, ...(user.outletIds.length > 0 ? { outletId: { in: user.outletIds } } : {}) };
  }

  async list(user: TenantUser): Promise<DeviceDto[]> {
    const db = this.prisma.forTenant(user.companyId);
    const devices = await db.device.findMany({ where: this.scope(user), orderBy: [{ claimedAt: 'asc' }, { serialNumber: 'asc' }] });
    return devices.map(toDeviceDto);
  }

  /**
   * Adds a soundbox to the merchant's account. Unknown serial, wrong code and "already claimed"
   * give the same answer, so serial numbers cannot be probed.
   */
  async claim(
    user: TenantUser,
    dto: { serialNumber: string; claimCode: string; name?: string; outletId?: string; locale?: Locale },
    ip: string | null,
  ): Promise<DeviceDto> {
    const serial = dto.serialNumber.trim().toUpperCase();
    const device = await this.prisma.device.findUnique({ where: { serialNumber: serial } });
    const codeOk = device ? await verify(device.claimCodeHash, normaliseClaimCode(dto.claimCode)).catch(() => false) : false;
    if (!device || !codeOk || device.status !== 'UNASSIGNED') throw apiError(HttpStatus.BAD_REQUEST, 'DEVICE_CLAIM_INVALID');
    if (dto.outletId) await this.assertOutlet(user, dto.outletId);
    // Outlet-restricted staff must place the device at one of their outlets.
    else if (user.outletIds.length > 0) throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');

    const claimed = await this.prisma.$transaction(async (tx) => {
      await this.entitlements.assertCanAdd(tx, user.companyId, 'devices');
      // Conditional update: two merchants racing for the same box cannot both win.
      const res = await tx.device.updateMany({
        where: { id: device.id, status: 'UNASSIGNED' },
        data: {
          companyId: user.companyId,
          outletId: dto.outletId ?? null,
          name: dto.name?.trim() || null,
          locale: dto.locale ?? device.locale,
          status: 'ACTIVE',
          claimedAt: new Date(),
        },
      });
      if (res.count !== 1) throw apiError(HttpStatus.BAD_REQUEST, 'DEVICE_CLAIM_INVALID');
      await this.audit.log(
        { companyId: user.companyId, actorUserId: user.userId, action: 'device.claimed', entityType: 'device', entityId: device.id, metadata: { serialNumber: serial }, ipAddress: ip },
        tx,
      );
      return tx.device.findUniqueOrThrow({ where: { id: device.id } });
    });
    await this.sendConfig(claimed);
    return toDeviceDto(claimed);
  }

  async update(
    user: TenantUser,
    id: string,
    dto: { name?: string | null; outletId?: string | null; locale?: Locale; volume?: number },
    ip: string | null,
  ): Promise<DeviceDto> {
    const device = await this.findOwned(user, id);
    if (dto.outletId) await this.assertOutlet(user, dto.outletId);
    // Restricted staff may not move a device out of their outlets (or to "all outlets").
    if (dto.outletId === null && user.outletIds.length > 0) throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.device.update({
        where: { id: device.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name?.trim() || null } : {}),
          ...(dto.outletId !== undefined ? { outletId: dto.outletId } : {}),
          ...(dto.locale ? { locale: dto.locale } : {}),
          ...(dto.volume !== undefined ? { volume: dto.volume } : {}),
        },
      });
      await this.audit.log(
        { companyId: user.companyId, actorUserId: user.userId, action: 'device.updated', entityType: 'device', entityId: id, metadata: { fields: Object.keys(dto) }, ipAddress: ip },
        tx,
      );
      return d;
    });
    await this.sendConfig(updated);
    return toDeviceDto(updated);
  }

  /** Gives the device back (e.g. returned or sold on). It can be claimed again with its box code. */
  async release(user: TenantUser, id: string, ip: string | null): Promise<void> {
    const device = await this.findOwned(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: device.id },
        data: { companyId: null, outletId: null, name: null, claimedAt: null, status: device.status === 'DISABLED' ? 'DISABLED' : 'UNASSIGNED' },
      });
      await this.audit.log(
        { companyId: user.companyId, actorUserId: user.userId, action: 'device.released', entityType: 'device', entityId: id, metadata: { serialNumber: device.serialNumber }, ipAddress: ip },
        tx,
      );
    });
  }

  async test(user: TenantUser, id: string): Promise<DeviceTestResultDto> {
    const device = await this.findOwned(user, id);
    if (device.status === 'DISABLED') throw apiError(HttpStatus.CONFLICT, 'DEVICE_DISABLED');
    const sent = await this.send(device, { type: 'test', text: DEVICE_TEST_TEXT[device.locale], locale: device.locale, volume: device.volume });
    return { sent, online: device.online };
  }

  // ───────────────────────── Announcements ─────────────────────────

  /**
   * "Money received" on every soundbox that covers this payment: devices placed at the payment's
   * outlet, and devices not tied to an outlet (they announce the whole shop).
   */
  async announcePayment(txn: TransactionDto): Promise<number> {
    if (!this.mqtt.enabled) return 0;
    const devices = await this.prisma.device.findMany({
      where: {
        companyId: txn.companyId,
        status: 'ACTIVE',
        OR: [{ outletId: null }, ...(txn.outletId ? [{ outletId: txn.outletId }] : [])],
      },
    });
    let sent = 0;
    for (const d of devices) {
      const text = paymentAlertMessage(d.locale, { amountMinor: txn.amountMinor, currency: txn.currency }).body;
      const ok = await this.send(d, {
        type: 'payment',
        id: txn.id,
        amountMinor: txn.amountMinor,
        currency: txn.currency,
        amount: fromMinorUnits(txn.amountMinor, txn.currency),
        text,
        locale: d.locale,
        volume: d.volume,
        simulated: txn.isSimulated,
        occurredAt: txn.occurredAt,
      });
      if (ok) sent++;
    }
    return sent;
  }

  private sendConfig(d: Device): Promise<boolean> {
    if (d.status !== 'ACTIVE') return Promise.resolve(false);
    return this.send(d, { type: 'config', locale: d.locale, volume: d.volume, name: d.name });
  }

  private send(d: Device, command: DeviceCommand): Promise<boolean> {
    return this.mqtt.publish(deviceTopics(d.serialNumber).cmd, command);
  }

  // ───────────────────────── Device → platform ─────────────────────────

  async handleDeviceMessage(topic: string, payload: Buffer): Promise<void> {
    const m = /^onepay\/d\/([^/]+)\/(status|telemetry)$/.exec(topic);
    if (!m || !DEVICE_SERIAL_PATTERN.test(m[1]!)) return;
    const [, serial, kind] = m as unknown as [string, string, 'status' | 'telemetry'];
    const text = payload.toString('utf8').slice(0, 2048);
    let data: Prisma.DeviceUpdateManyMutationInput;
    if (kind === 'status') {
      const status = text.trim().toLowerCase();
      if (status !== 'online' && status !== 'offline') return;
      data = { online: status === 'online', lastSeenAt: new Date() };
    } else {
      let t: Record<string, unknown>;
      try {
        t = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return;
      }
      const int = (v: unknown, min: number, max: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;
      data = {
        online: true,
        lastSeenAt: new Date(),
        ...(typeof t.firmware === 'string' ? { firmware: t.firmware.slice(0, 32) } : {}),
        ...(int(t.batteryPct, 0, 100) !== undefined ? { batteryPct: int(t.batteryPct, 0, 100) } : {}),
        ...(int(t.signalDbm, -150, 0) !== undefined ? { signalDbm: int(t.signalDbm, -150, 0) } : {}),
      };
    }
    const res = await this.prisma.device.updateMany({ where: { serialNumber: serial }, data });
    if (res.count === 0) return;
    const d = await this.prisma.device.findUnique({ where: { serialNumber: serial } });
    if (d?.companyId && d.status === 'ACTIVE') this.realtime.emitDevice(d.companyId, d.outletId, toDeviceDto(d));
  }

  // ───────────────────────── EMQX hooks ─────────────────────────

  hookSecretValid(header: string | undefined): boolean {
    const secret = this.config.get('MQTT_HOOK_SECRET');
    return !!secret && !!header && safeEqual(header, secret);
  }

  /** Who may connect: the API (superuser) and registered, non-disabled devices with their own password. */
  async authenticate(req: MqttAuthRequest): Promise<MqttHookResult> {
    const { username = '', password = '', clientid = '' } = req;
    const apiPassword = this.config.get('MQTT_PASSWORD');
    if (username === this.config.get('MQTT_USERNAME')) {
      return apiPassword && safeEqual(password, apiPassword) ? { result: 'allow', is_superuser: true } : { result: 'deny' };
    }
    if (!DEVICE_SERIAL_PATTERN.test(username) || clientid !== username || !password) return { result: 'deny' };
    const device = await this.prisma.device.findUnique({ where: { serialNumber: username } });
    if (!device || device.status === 'DISABLED') return { result: 'deny' };
    const ok = await verify(device.secretHash, password).catch(() => false);
    return ok ? { result: 'allow', is_superuser: false } : { result: 'deny' };
  }

  /** What a device may touch: only its own command, status and telemetry topics. */
  authorize(req: MqttAclRequest): MqttHookResult {
    const { username = '', clientid = '', topic = '', action = '' } = req;
    if (!DEVICE_SERIAL_PATTERN.test(username) || clientid !== username) return { result: 'deny' };
    if (action !== 'publish' && action !== 'subscribe') return { result: 'deny' };
    return { result: deviceMayAccess(username, action, topic) ? 'allow' : 'deny' };
  }

  // ───────────────────────── helpers ─────────────────────────

  private async findOwned(user: TenantUser, id: string): Promise<Device> {
    const db = this.prisma.forTenant(user.companyId);
    const d = await db.device.findFirst({ where: { id, ...this.scope(user) } });
    if (!d) throw apiError(HttpStatus.NOT_FOUND, 'DEVICE_NOT_FOUND');
    return d;
  }

  private async assertOutlet(user: TenantUser, outletId: string): Promise<void> {
    if (user.outletIds.length > 0 && !user.outletIds.includes(outletId)) throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outletId, companyId: user.companyId } });
    if (!outlet) throw apiError(HttpStatus.BAD_REQUEST, 'OUTLET_NOT_EXIST');
  }
}
