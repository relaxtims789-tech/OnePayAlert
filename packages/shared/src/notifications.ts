import type { Locale } from './enums';
import { formatMoney, type Currency } from './money';

export interface PaymentAlertInput {
  amountMinor: number | bigint;
  currency: Currency;
  payerName?: string | null;
  outletName?: string | null;
}

export interface LocalizedMessage {
  title: string;
  body: string;
}

const TITLES: Record<Locale, string> = {
  km: 'One PayAlert · ទទួលបានប្រាក់',
  en: 'One PayAlert · Payment received',
  zh: 'One PayAlert · 收款成功',
};

/** Payment alert text for push notifications and spoken announcements (km / en / zh). */
export function paymentAlertMessage(locale: Locale, input: PaymentAlertInput): LocalizedMessage {
  const amount = formatMoney(input.amountMinor, input.currency, locale);
  const payer = input.payerName?.trim() || null;
  const outlet = input.outletName?.trim() || null;
  let body: string;
  switch (locale) {
    case 'km':
      body = payer ? `បានទទួលប្រាក់ ${amount} ពី ${payer}` : `បានទទួលប្រាក់ ${amount}`;
      if (outlet) body += ` · ${outlet}`;
      break;
    case 'zh':
      body = payer ? `已收到 ${payer} 付款 ${amount}` : `已收到付款 ${amount}`;
      if (outlet) body += ` · ${outlet}`;
      break;
    default:
      body = payer ? `Received ${amount} from ${payer}` : `Received ${amount}`;
      if (outlet) body += ` · ${outlet}`;
  }
  return { title: TITLES[locale] ?? TITLES.en, body };
}
