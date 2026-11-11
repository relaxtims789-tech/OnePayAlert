import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { Locale } from '@onepay/shared';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Outbound email. `smtp` delivers for real (mandatory in demo/production);
 * `log` keeps messages in an in-memory outbox and logs a redacted line (dev/test only).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  /** Dev/test only: last messages sent with the `log` driver. */
  readonly outbox: MailMessage[] = [];

  constructor(private readonly config: AppConfig) {
    const url = config.get('SMTP_URL');
    this.transport = config.get('MAIL_DRIVER') === 'smtp' && url ? createTransport(url) : null;
  }

  async send(message: MailMessage): Promise<void> {
    if (this.transport) {
      await this.transport.sendMail({ from: this.config.get('MAIL_FROM'), ...message });
      return;
    }
    this.outbox.push(message);
    if (this.outbox.length > 50) this.outbox.shift();
    this.logger.log(`[mail:log] to=${message.to} subject="${message.subject}"`);
    if (this.config.get('APP_ENV') === 'development') this.logger.log(message.text);
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}

const RESET_COPY: Record<Locale, { subject: string; intro: string; action: string; ignore: string }> = {
  en: {
    subject: 'Reset your One PayAlert password',
    intro: 'We received a request to reset your password. This link is valid for 30 minutes.',
    action: 'Reset password',
    ignore: 'If you did not request this, you can ignore this email.',
  },
  km: {
    subject: 'កំណត់ពាក្យសម្ងាត់ One PayAlert ឡើងវិញ',
    intro: 'យើងបានទទួលសំណើកំណត់ពាក្យសម្ងាត់របស់អ្នកឡើងវិញ។ តំណនេះមានសុពលភាព 30 នាទី។',
    action: 'កំណត់ពាក្យសម្ងាត់ឡើងវិញ',
    ignore: 'ប្រសិនបើអ្នកមិនបានស្នើសុំទេ សូមមិនអើពើអ៊ីមែលនេះ។',
  },
  zh: {
    subject: '重置您的 One PayAlert 密码',
    intro: '我们收到了重置您密码的请求。此链接 30 分钟内有效。',
    action: '重置密码',
    ignore: '如果这不是您本人的操作，请忽略此邮件。',
  },
};

export function passwordResetEmail(locale: Locale, name: string, link: string): Omit<MailMessage, 'to'> {
  const c = RESET_COPY[locale] ?? RESET_COPY.en;
  const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return {
    subject: c.subject,
    text: `${name},\n\n${c.intro}\n\n${c.action}: ${link}\n\n${c.ignore}\n\nOne PayAlert · Mysoftkh`,
    html:
      `<div style="font-family:Inter,'Noto Sans Khmer',Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">` +
      `<h2 style="color:#0759B8">One PayAlert</h2><p>${esc(name)},</p><p>${esc(c.intro)}</p>` +
      `<p><a href="${esc(link)}" style="display:inline-block;background:#0759B8;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">${esc(c.action)}</a></p>` +
      `<p style="color:#64748b;font-size:13px">${esc(c.ignore)}</p></div>`,
  };
}
