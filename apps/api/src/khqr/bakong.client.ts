import { Logger, type Provider } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../config/app-config.service';

export const BAKONG_CLIENT = Symbol('BAKONG_CLIENT');

/** A completed Bakong transfer, as returned by check_transaction_by_md5. */
export interface BakongTransaction {
  hash: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  currency: string;
  /** Decimal string as sent by Bakong (it may arrive as a number). */
  amount: string;
  description: string | null;
  /** When Bakong acknowledged it (falls back to creation time, then now). */
  occurredAt: Date;
}

export class BakongError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface BakongClient {
  readonly mode: 'live' | 'simulated' | 'off';
  /** null = not paid (yet). Throws BakongError on transport/auth problems. */
  checkMd5(md5: string): Promise<BakongTransaction | null>;
  /** MD5s Bakong reports as paid, among up to 50. */
  paidAmong(md5s: string[]): Promise<Set<string>>;
  /** Whether Bakong knows the account (null = cannot tell, e.g. simulated). */
  accountExists(accountId: string): Promise<boolean | null>;
}

const asText = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/** Parses the `data` object of a successful check; tolerant of number/string amounts and missing dates. */
export function parseBakongTransaction(data: Record<string, unknown>): BakongTransaction {
  const hash = asText(data.hash) ?? asText(data.externalRef) ?? asText(data.instructionRef);
  if (!hash) throw new BakongError('Bakong transaction without a hash', false);
  const ms = Number(data.acknowledgedDateMs ?? data.createdDateMs);
  return {
    hash,
    fromAccountId: asText(data.fromAccountId),
    toAccountId: asText(data.toAccountId),
    currency: String(data.currency ?? '').toUpperCase(),
    amount: String(data.amount ?? ''),
    description: asText(data.description),
    occurredAt: Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date(),
  };
}

/**
 * Bakong Open API (https://api-bakong.nbc.gov.kh). POST JSON with `Authorization: Bearer <token>`.
 * A check answers `{ responseCode: 0, data: {...} }` when the transfer exists, and a non-zero
 * responseCode (1 = not found) otherwise.
 */
export class LiveBakongClient implements BakongClient {
  readonly mode = 'live' as const;
  private readonly logger = new Logger('Bakong');

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/v1/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new BakongError(`Bakong unreachable: ${e instanceof Error ? e.message : String(e)}`, true);
    }
    if (res.status === 401 || res.status === 403) throw new BakongError(`Bakong rejected the API token (HTTP ${res.status})`, false);
    if (res.status === 429 || res.status >= 500) throw new BakongError(`Bakong HTTP ${res.status}`, true);
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) throw new BakongError(`Bakong returned no JSON (HTTP ${res.status})`, true);
    return json;
  }

  async checkMd5(md5: string): Promise<BakongTransaction | null> {
    const json = await this.post('check_transaction_by_md5', { md5 });
    if (Number(json.responseCode) !== 0) return null;
    const data = json.data;
    if (!data || typeof data !== 'object') return null;
    return parseBakongTransaction(data as Record<string, unknown>);
  }

  async paidAmong(md5s: string[]): Promise<Set<string>> {
    if (md5s.length === 0) return new Set();
    if (md5s.length > 50) throw new BakongError('At most 50 MD5s per check', false);
    const json = await this.post('check_transaction_by_md5_list', md5s);
    const rows = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [];
    return new Set(
      rows.filter((r) => ['SUCCESS', 'PAID'].includes(String(r.status ?? '').toUpperCase()) && typeof r.md5 === 'string').map((r) => String(r.md5)),
    );
  }

  async accountExists(accountId: string): Promise<boolean | null> {
    try {
      const json = await this.post('check_bakong_account', { accountId });
      return Number(json.responseCode) === 0;
    } catch (e) {
      this.logger.warn(`Account check failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}

/**
 * Demo/development stand-in when no Bakong token is configured: nothing is paid until someone
 * presses "customer paid" (which only exists outside production). Never used in production.
 */
export class SimulatedBakongClient implements BakongClient {
  readonly mode = 'simulated' as const;
  private readonly paid = new Map<string, BakongTransaction>();

  markPaid(md5: string, tx: Omit<BakongTransaction, 'hash' | 'occurredAt'>): BakongTransaction {
    const full = { ...tx, hash: `SIMBK${randomBytes(12).toString('hex')}`, occurredAt: new Date() };
    this.paid.set(md5, full);
    return full;
  }

  async checkMd5(md5: string): Promise<BakongTransaction | null> {
    return this.paid.get(md5) ?? null;
  }

  async paidAmong(md5s: string[]): Promise<Set<string>> {
    return new Set(md5s.filter((m) => this.paid.has(m)));
  }

  async accountExists(): Promise<boolean | null> {
    return null;
  }
}

export class DisabledBakongClient implements BakongClient {
  readonly mode = 'off' as const;
  async checkMd5(): Promise<null> {
    return null;
  }
  async paidAmong(): Promise<Set<string>> {
    return new Set();
  }
  async accountExists(): Promise<null> {
    return null;
  }
}

export const bakongClientProvider: Provider = {
  provide: BAKONG_CLIENT,
  inject: [AppConfig],
  useFactory: (config: AppConfig): BakongClient => {
    const token = config.get('BAKONG_API_TOKEN');
    if (token) return new LiveBakongClient(config.get('BAKONG_API_URL'), token);
    // Without a token, demo and development simulate Bakong; production cannot collect at all.
    return config.isProduction ? new DisabledBakongClient() : new SimulatedBakongClient();
  },
};
