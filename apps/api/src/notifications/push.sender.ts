import { Injectable, Logger } from '@nestjs/common';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { AppConfig } from '../config/app-config.service';

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushResult {
  sent: number;
  /** Tokens FCM reported as unregistered/invalid; the caller deletes them. */
  invalidTokens: string[];
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushSender {
  readonly enabled: boolean;
  send(message: PushMessage): Promise<PushResult>;
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Firebase Cloud Messaging sender (Android, iOS via APNs, web). */
@Injectable()
export class FcmPushSender implements PushSender {
  readonly enabled = true;
  private readonly app: App;

  constructor(serviceAccountJson: string) {
    this.app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) }, `onepay-${Date.now()}`);
  }

  async send(m: PushMessage): Promise<PushResult> {
    if (m.tokens.length === 0) return { sent: 0, invalidTokens: [] };
    const res = await getMessaging(this.app).sendEachForMulticast({
      tokens: m.tokens,
      notification: { title: m.title, body: m.body },
      data: m.data,
      android: { priority: 'high', notification: { channelId: 'payments', sound: 'default' } },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
    });
    const invalidTokens = res.responses.flatMap((r, i) =>
      !r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code) ? [m.tokens[i]!] : [],
    );
    return { sent: res.successCount, invalidTokens };
  }
}

/** Used when FCM credentials are not configured: push is explicitly off, never faked. */
export class DisabledPushSender implements PushSender {
  readonly enabled = false;
  private readonly logger = new Logger('PushSender');
  private warned = false;

  async send(m: PushMessage): Promise<PushResult> {
    if (!this.warned && m.tokens.length > 0) {
      this.logger.warn('FCM push is disabled (FIREBASE_SERVICE_ACCOUNT_BASE64 not set)');
      this.warned = true;
    }
    return { sent: 0, invalidTokens: [] };
  }
}

export const pushSenderProvider = {
  provide: PUSH_SENDER,
  inject: [AppConfig],
  useFactory: (config: AppConfig): PushSender => {
    const b64 = config.get('FIREBASE_SERVICE_ACCOUNT_BASE64');
    return b64 ? new FcmPushSender(Buffer.from(b64, 'base64').toString('utf8')) : new DisabledPushSender();
  },
};
