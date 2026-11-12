import type { Currency } from './money';
import type { CurrencySummary } from './payments';

export type ReportGranularity = 'day' | 'week' | 'month';

/** Longest range one report may cover. */
export const MAX_REPORT_DAYS = 366;

export interface ReportBucket {
  /** Start of the bucket in Asia/Phnom_Penh, YYYY-MM-DD (weeks start on Monday). */
  period: string;
  currency: Currency;
  successCount: number;
  successAmountMinor: number;
}

export interface ReportBreakdownRow {
  key: string;
  label: string;
  currency: Currency;
  successCount: number;
  successAmountMinor: number;
}

/** GET /reports/sales */
export interface SalesReportDto {
  from: string;
  to: string;
  granularity: ReportGranularity;
  timezone: string;
  includeSimulated: boolean;
  totals: CurrencySummary[];
  series: ReportBucket[];
  byOutlet: ReportBreakdownRow[];
  byProvider: ReportBreakdownRow[];
}
