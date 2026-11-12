import { dirname, join } from 'node:path';
import { formatMoney, type Currency, type Locale, type ReportBreakdownRow, type SalesReportDto } from '@onepay/shared';
import PDFDocument from 'pdfkit';

// Kantumruy Pro covers Khmer and Latin (and fontkit shapes every Khmer string we use with it;
// Noto Sans Khmer crashes fontkit's mark positioning on words like "ទំព័រ"). Noto Sans SC is used
// for any text containing Chinese.
const khmerDir = dirname(require.resolve('@expo-google-fonts/kantumruy-pro/package.json'));
const scDir = dirname(require.resolve('@expo-google-fonts/noto-sans-sc/package.json'));
const FONTS = {
  regular: join(khmerDir, '400Regular', 'KantumruyPro_400Regular.ttf'),
  bold: join(khmerDir, '700Bold', 'KantumruyPro_700Bold.ttf'),
  cjk: join(scDir, '400Regular', 'NotoSansSC_400Regular.ttf'),
  cjkBold: join(scDir, '700Bold', 'NotoSansSC_700Bold.ttf'),
};
const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;
/** Khmer vowel signs, diacritics and the coeng — dropped only when a string cannot be shaped. */
const KHMER_MARKS = /[ា-៓៝]/g;

type LabelKey =
  | 'title'
  | 'period'
  | 'groupedBy'
  | 'outlet'
  | 'allOutlets'
  | 'unassigned'
  | 'generated'
  | 'demoIncluded'
  | 'demoExcluded'
  | 'totals'
  | 'currency'
  | 'payments'
  | 'amount'
  | 'pending'
  | 'failed'
  | 'reversed'
  | 'overTime'
  | 'byOutlet'
  | 'byProvider'
  | 'provider'
  | 'noPayments'
  | 'page'
  | 'day'
  | 'week'
  | 'month'
  | 'timezone';

const LABELS: Record<Locale, Record<LabelKey, string>> = {
  en: {
    title: 'Sales report',
    period: 'Period',
    groupedBy: 'Grouped by',
    outlet: 'Outlet',
    allOutlets: 'All outlets',
    unassigned: 'No outlet',
    generated: 'Generated',
    demoIncluded: 'Includes demo (simulated) payments',
    demoExcluded: 'Real payments only',
    totals: 'Totals',
    currency: 'Currency',
    payments: 'Payments',
    amount: 'Amount received',
    pending: 'Pending',
    failed: 'Failed',
    reversed: 'Reversed',
    overTime: 'Received over time',
    byOutlet: 'By outlet',
    byProvider: 'By bank / provider',
    provider: 'Bank / provider',
    noPayments: 'No successful payments in this period.',
    page: 'Page',
    day: 'Day',
    week: 'Week (from Monday)',
    month: 'Month',
    timezone: 'Times are Phnom Penh time (UTC+7).',
  },
  km: {
    title: 'របាយការណ៍លក់',
    period: 'រយៈពេល',
    groupedBy: 'បូកសរុបតាម',
    outlet: 'សាខា',
    allOutlets: 'គ្រប់សាខា',
    unassigned: 'គ្មានសាខា',
    generated: 'បង្កើតនៅ',
    demoIncluded: 'រួមបញ្ចូលការទូទាត់សាកល្បង',
    demoExcluded: 'តែការទូទាត់ពិតប៉ុណ្ណោះ',
    totals: 'សរុប',
    currency: 'រូបិយប័ណ្ណ',
    payments: 'ការទូទាត់',
    amount: 'ទឹកប្រាក់ទទួលបាន',
    pending: 'កំពុងរង់ចាំ',
    failed: 'បរាជ័យ',
    reversed: 'បានដកវិញ',
    overTime: 'ទឹកប្រាក់ទទួលបានតាមពេលវេលា',
    byOutlet: 'តាមសាខា',
    byProvider: 'តាមធនាគារ / អ្នកផ្ដល់សេវា',
    provider: 'ធនាគារ / អ្នកផ្ដល់សេវា',
    noPayments: 'មិនមានការទូទាត់ជោគជ័យក្នុងរយៈពេលនេះទេ។',
    page: 'ទំព័រ',
    day: 'ថ្ងៃ',
    week: 'សប្ដាហ៍ (ចាប់ពីថ្ងៃច័ន្ទ)',
    month: 'ខែ',
    timezone: 'ម៉ោងគិតតាមម៉ោងភ្នំពេញ (UTC+7)។',
  },
  zh: {
    title: '销售报表',
    period: '期间',
    groupedBy: '汇总方式',
    outlet: '门店',
    allOutlets: '全部门店',
    unassigned: '未分配门店',
    generated: '生成时间',
    demoIncluded: '包含演示（模拟）付款',
    demoExcluded: '仅真实付款',
    totals: '合计',
    currency: '币种',
    payments: '笔数',
    amount: '收款金额',
    pending: '处理中',
    failed: '失败',
    reversed: '已冲正',
    overTime: '按时间收款',
    byOutlet: '按门店',
    byProvider: '按银行 / 服务商',
    provider: '银行 / 服务商',
    noPayments: '此期间没有成功的付款。',
    page: '第',
    day: '日',
    week: '周（自周一起）',
    month: '月',
    timezone: '时间为金边时间（UTC+7）。',
  },
};

export interface SalesPdfInput {
  report: SalesReportDto;
  locale: Locale;
  companyName: string;
  outletName: string | null;
  generatedAt: Date;
  /** Called when a string could only be drawn without its Khmer marks. */
  onTextFallback?: (text: string, error: unknown) => void;
}

const BRAND = '#0759B8';
const INK = '#0F172A';
const INK2 = '#475569';
const LINE = '#E2E8F0';
const SURFACE = '#F5F7FA';

/** Phnom Penh calendar date of an instant, YYYY-MM-DD. */
const ppDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
/** The report range's `to` is exclusive; show the last included day. */
const ppLastDay = (iso: string) => ppDate(new Date(new Date(iso).getTime() - 1).toISOString());

/** Renders the sales report as a PDF (A4) and resolves with its bytes. */
export function renderSalesPdf({ report, locale, companyName, outletName, generatedAt, onTextFallback }: SalesPdfInput): Promise<Buffer> {
  const L = LABELS[locale];
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `${L.title} — ${companyName}` } });
  doc.registerFont('regular', FONTS.regular);
  doc.registerFont('bold', FONTS.bold);
  doc.registerFont('cjk', FONTS.cjk);
  doc.registerFont('cjkBold', FONTS.cjkBold);

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 24;

  const font = (text: string, bold = false) => doc.font(CJK.test(text) ? (bold ? 'cjkBold' : 'cjk') : bold ? 'bold' : 'regular');
  const write = (text: string, x: number, y: number, opts: PDFKit.Mixins.TextOptions & { bold?: boolean; size?: number; color?: string } = {}) => {
    const { bold, size = 9.5, color = INK, ...rest } = opts;
    const draw = (t: string) => font(t, bold).fontSize(size).fillColor(color).text(t, x, y, { lineBreak: false, ellipsis: true, ...rest });
    try {
      draw(text);
    } catch (e) {
      // fontkit can fail to position some Khmer mark combinations (merchant-typed names). Better a
      // name without its diacritics than no report at all.
      onTextFallback?.(text, e);
      draw(text.normalize('NFC').replace(KHMER_MARKS, ''));
    }
  };
  const money = (minor: number, currency: Currency) => formatMoney(minor, currency, 'en');

  // ── Header
  doc.rect(0, 0, doc.page.width, 92).fill(BRAND);
  write('One PayAlert', left, 24, { bold: true, size: 11, color: '#FFFFFF' });
  write(L.title, left, 42, { bold: true, size: 20, color: '#FFFFFF', width });
  write(companyName, left, 70, { size: 10, color: '#DBEAFE', width });

  let y = 110;
  const meta: [string, string][] = [
    [L.period, `${ppDate(report.from)} – ${ppLastDay(report.to)}`],
    [L.groupedBy, L[report.granularity]],
    [L.outlet, outletName ?? L.allOutlets],
    [L.generated, `${ppDate(generatedAt.toISOString())} ${new Date(generatedAt.getTime() + 7 * 3_600_000).toISOString().slice(11, 16)}`],
  ];
  for (const [k, v] of meta) {
    write(k, left, y, { color: INK2, width: 110 });
    write(v, left + 115, y, { width: width - 115 });
    y += 16;
  }
  write(`${report.includeSimulated ? L.demoIncluded : L.demoExcluded} · ${L.timezone}`, left, y + 2, { size: 8.5, color: INK2, width });
  y += 28;

  type Col = { label: string; width: number; align?: 'left' | 'right' };
  const section = (title: string) => {
    if (y + 60 > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    write(title, left, y, { bold: true, size: 12.5, width });
    y += 22;
  };
  const table = (cols: Col[], rows: string[][]) => {
    const header = () => {
      doc.rect(left, y - 4, width, 20).fill(SURFACE);
      let x = left;
      for (const c of cols) {
        write(c.label, x + 6, y + 1, { bold: true, size: 8.5, color: INK2, width: c.width - 12, align: c.align ?? 'left' });
        x += c.width;
      }
      y += 20;
    };
    header();
    for (const r of rows) {
      if (y + 18 > bottom()) {
        doc.addPage();
        y = doc.page.margins.top;
        header();
      }
      let x = left;
      r.forEach((cell, i) => {
        const c = cols[i] as Col;
        write(cell, x + 6, y, { width: c.width - 12, align: c.align ?? 'left' });
        x += c.width;
      });
      y += 16;
      doc.moveTo(left, y - 3).lineTo(left + width, y - 3).lineWidth(0.5).strokeColor(LINE).stroke();
    }
    y += 14;
  };
  const empty = () => {
    write(L.noPayments, left, y, { color: INK2, width });
    y += 26;
  };

  // ── Totals
  section(L.totals);
  if (report.totals.length === 0) empty();
  else
    table(
      [
        { label: L.currency, width: width * 0.14 },
        { label: L.payments, width: width * 0.14, align: 'right' },
        { label: L.amount, width: width * 0.26, align: 'right' },
        { label: L.pending, width: width * 0.14, align: 'right' },
        { label: L.failed, width: width * 0.14, align: 'right' },
        { label: L.reversed, width: width * 0.18, align: 'right' },
      ],
      report.totals.map((t) => [
        t.currency,
        String(t.successCount),
        money(t.successAmountMinor, t.currency),
        String(t.pendingCount),
        String(t.failedCount),
        String(t.reversedCount),
      ]),
    );

  // ── Over time
  section(L.overTime);
  const periodLabel = (p: string) => (report.granularity === 'month' ? p.slice(0, 7) : p);
  if (report.series.length === 0) empty();
  else
    table(
      [
        { label: L[report.granularity], width: width * 0.3 },
        { label: L.currency, width: width * 0.16 },
        { label: L.payments, width: width * 0.2, align: 'right' },
        { label: L.amount, width: width * 0.34, align: 'right' },
      ],
      report.series.map((s) => [periodLabel(s.period), s.currency, String(s.successCount), money(s.successAmountMinor, s.currency)]),
    );

  const breakdown = (title: string, firstCol: string, rows: ReportBreakdownRow[], blank: string) => {
    section(title);
    if (rows.length === 0) return empty();
    table(
      [
        { label: firstCol, width: width * 0.46 },
        { label: L.currency, width: width * 0.14 },
        { label: L.payments, width: width * 0.14, align: 'right' },
        { label: L.amount, width: width * 0.26, align: 'right' },
      ],
      rows.map((r) => [r.label || blank, r.currency, String(r.successCount), money(r.successAmountMinor, r.currency)]),
    );
  };
  breakdown(L.byOutlet, L.outlet, report.byOutlet, L.unassigned);
  breakdown(L.byProvider, L.provider, report.byProvider, '—');

  // ── Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const text = locale === 'zh' ? `第 ${i + 1} / ${range.count} 页` : `${L.page} ${i + 1} / ${range.count}`;
    // Footer sits inside the bottom margin; lift the margin so pdfkit does not start a new page.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    write(text, left, doc.page.height - margin + 12, { size: 8, color: INK2, width, align: 'right' });
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return done;
}
