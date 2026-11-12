import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Permission, RealtimeEvent, hasPermissions, type TransactionDto } from '@onepay/shared';
import type { Namespace, Socket } from 'socket.io';
import { PrincipalService } from '../auth/principal.service';
import type { AuthUser } from '../common/auth-user';

export const companyRoom = (companyId: string) => `c:${companyId}:all`;
export const outletRoom = (outletId: string) => `o:${outletId}`;

/**
 * Live payment feed on namespace `/realtime`.
 *
 * Clients connect with `io(url + '/realtime', { auth: { token: <accessToken> } })`.
 * Members with access to every outlet join the company room; outlet-restricted members only
 * join their outlets' rooms, so they never receive other outlets' payments. The socket is
 * dropped when the access token expires; clients reconnect with a refreshed token.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly principals: PrincipalService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || !token) throw new Error('Missing token');
      const claims = await this.principals.verifyToken(token);
      const user: AuthUser = await this.principals.resolve(claims);
      if (!user.companyId || !hasPermissions(user.permissions, [Permission.TRANSACTION_READ])) {
        throw new Error('Not allowed to receive payment events');
      }
      socket.data.user = user;
      const rooms = user.outletIds.length > 0 ? user.outletIds.map(outletRoom) : [companyRoom(user.companyId)];
      await socket.join(rooms);

      const msUntilExpiry = claims.exp * 1000 - Date.now();
      const timer = setTimeout(() => {
        socket.emit('session.expired');
        socket.disconnect(true);
      }, Math.max(msUntilExpiry, 0));
      timer.unref();
      this.expiryTimers.set(socket.id, timer);
      socket.emit('ready', { companyId: user.companyId, rooms: rooms.length });
    } catch (e) {
      socket.emit('error', { message: (e as Error).message || 'Unauthorized' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const t = this.expiryTimers.get(socket.id);
    if (t) clearTimeout(t);
    this.expiryTimers.delete(socket.id);
  }

  /** Soundbox online/offline/telemetry changes, to the same audience as that outlet's payments. */
  emitDevice(companyId: string, outletId: string | null, device: unknown): void {
    if (!this.server) return;
    const rooms = [companyRoom(companyId)];
    if (outletId) rooms.push(outletRoom(outletId));
    this.server.to(rooms).emit(RealtimeEvent.DEVICE_UPDATED, device);
  }

  emitTransaction(event: RealtimeEvent, txn: TransactionDto): void {
    if (!this.server) return;
    const rooms = [companyRoom(txn.companyId)];
    if (txn.outletId) rooms.push(outletRoom(txn.outletId));
    this.server.to(rooms).emit(event, txn);
    this.logger.debug(`Emitted ${event} ${txn.id} to ${rooms.join(',')}`);
  }
}
