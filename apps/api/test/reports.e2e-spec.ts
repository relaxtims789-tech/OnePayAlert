import type { INestApplication } from '@nestjs/common';
import type { AuthTokens, PaymentProviderDto, SalesReportDto } from '@onepay/shared';
import request from 'supertest';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail } from './helpers';

/** Binary-safe body for supertest (PDF). */
const buffer = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Reports, exports and translated errors (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let owner: AuthTokens;
  let companyId: string;
  let riverside: string;
  let bkk: string;

  // March 2026, Phnom Penh time (UTC+7).
  const FROM = '2026-02-28T17:00:00.000Z'; // 1 Mar 00:00 PP
  const TO = '2026-03-31T17:00:00.000Z'; // 1 Apr 00:00 PP

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    const shop = await registerMerchant(app, 'Report Cafe');
    owner = shop.tokens;
    companyId = shop.companyId;
    const prisma = prismaOf(app);
    riverside = (await request(http).post(`${API}/outlets`).set('Authorization', bearer(owner)).send({ name: 'Riverside', code: 'RIVER' }).expect(201)).body.id;
    bkk = (await request(http).post(`${API}/outlets`).set('Authorization', bearer(owner)).send({ name: 'BKK1', code: 'BKK1' }).expect(201)).body.id;
    const providers = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(owner)).expect(200)).body as PaymentProviderDto[];
    const conn = (
      await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(owner))
        .send({ providerId: providers.find((p) => p.code === 'DEMO_SIMULATOR')!.id, displayName: 'Counter', currency: 'USD' })
        .expect(201)
    ).body as { id: string };

    let n = 0;
    const tx = (occurredAt: string, amountMinor: bigint, outletId: string | null, extra: Record<string, unknown> = {}) =>
      prisma.transaction.create({
        data: {
          companyId,
          bankConnectionId: conn.id,
          outletId,
          providerTxnId: `RPT-${Date.now()}-${n++}`,
          status: 'SUCCESS',
          amountMinor,
          currency: 'USD',
          occurredAt: new Date(occurredAt),
          payerName: 'Chan Sophea',
          ...extra,
        },
      });
    // 23:59:59 on 1 Mar and 00:00 on 2 Mar, Phnom Penh time: different business days.
    await tx('2026-03-01T16:59:59.000Z', 1000n, riverside);
    await tx('2026-03-01T17:00:00.000Z', 250n, bkk);
    await tx('2026-03-20T03:00:00.000Z', 4000n, bkk, { payerName: '=HYPERLINK("http://evil.example","click")' });
    await tx('2026-03-21T03:00:00.000Z', 99_900n, riverside, { status: 'PENDING' });
    await tx('2026-03-22T03:00:00.000Z', 600_000n, null, { currency: 'KHR', payerName: 'សុខ ចាន់' });
    await tx('2026-03-23T03:00:00.000Z', 500n, riverside, { isSimulated: true });
    await tx('2026-04-01T03:00:00.000Z', 7_777n, riverside); // outside the range
  });
  afterAll(() => app.close());

  const sales = (t: AuthTokens, query: string) =>
    request(http).get(`${API}/reports/sales?from=${FROM}&to=${TO}&${query}`).set('Authorization', bearer(t));

  it('totals received money per Phnom Penh day, outlet and provider', async () => {
    const r = (await sales(owner, 'granularity=day').expect(200)).body as SalesReportDto;
    expect(r.timezone).toBe('Asia/Phnom_Penh');
    expect(r.totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', successCount: 4, successAmountMinor: 5750, pendingCount: 1 }),
        expect.objectContaining({ currency: 'KHR', successCount: 1, successAmountMinor: 600_000 }),
      ]),
    );
    const usd = r.series.filter((s) => s.currency === 'USD').map((s) => [s.period, s.successAmountMinor]);
    expect(usd).toEqual([
      ['2026-03-01', 1000],
      ['2026-03-02', 250],
      ['2026-03-20', 4000],
      ['2026-03-23', 500],
    ]);
    expect(r.byOutlet.filter((o) => o.currency === 'USD').map((o) => [o.label, o.successAmountMinor])).toEqual([
      ['BKK1', 4250],
      ['Riverside', 1500],
    ]);
    expect(r.byOutlet.find((o) => o.currency === 'KHR')).toMatchObject({ key: '', label: '' });
    expect(r.byProvider).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'DEMO_SIMULATOR', currency: 'USD' })]));
  });

  it('groups by week (Monday) and month, and can leave demo payments out', async () => {
    const month = (await sales(owner, 'granularity=month&includeSimulated=false').expect(200)).body as SalesReportDto;
    expect(month.includeSimulated).toBe(false);
    expect(month.series.find((s) => s.currency === 'USD')).toEqual({
      period: '2026-03-01',
      currency: 'USD',
      successCount: 3,
      successAmountMinor: 5250,
    });
    const week = (await sales(owner, 'granularity=week').expect(200)).body as SalesReportDto;
    // 1 Mar 2026 is a Sunday → week of Mon 23 Feb; 2 Mar starts a new week.
    expect(week.series.filter((s) => s.currency === 'USD').map((s) => s.period)).toEqual(['2026-02-23', '2026-03-02', '2026-03-16', '2026-03-23']);
  });

  it('applies outlet restrictions and the report permission', async () => {
    const managerEmail = uniqueEmail('manager');
    await request(http)
      .post(`${API}/employees`)
      .set('Authorization', bearer(owner))
      .send({ email: managerEmail, fullName: 'River Manager', role: 'MANAGER', initialPassword: PASSWORD, outletIds: [riverside] })
      .expect(201);
    const manager = await login(app, managerEmail);
    const r = (await sales(manager, 'granularity=month').expect(200)).body as SalesReportDto;
    expect(r.byOutlet.map((o) => o.label)).toEqual(['Riverside']);
    expect(r.totals.find((t) => t.currency === 'USD')?.successAmountMinor).toBe(1500);
    await sales(manager, `outletId=${bkk}`).expect(200).expect((res) => expect(res.body.totals).toEqual([]));

    const cashierEmail = uniqueEmail('cashier');
    await request(http)
      .post(`${API}/employees`)
      .set('Authorization', bearer(owner))
      .send({ email: cashierEmail, fullName: 'Cashier', role: 'CASHIER', initialPassword: PASSWORD })
      .expect(201);
    const cashier = await login(app, cashierEmail);
    await sales(cashier, '').expect(403);
    await request(http).get(`${API}/reports/transactions.csv`).set('Authorization', bearer(cashier)).expect(403);

    const other = await registerMerchant(app, 'Other Cafe');
    const theirs = (await sales(other.tokens, '').expect(200)).body as SalesReportDto;
    expect(theirs.totals).toEqual([]);
  });

  it('exports every payment as Excel-friendly CSV without formula injection', async () => {
    const res = await request(http)
      .get(`${API}/reports/transactions.csv?from=${FROM}&to=${TO}`)
      .set('Authorization', bearer(owner))
      .expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="payments_2026-03-01\.csv"$/);
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe(
      'occurred_at_phnom_penh,status,currency,amount,payer_name,payer_account,reference,outlet,bank_connection,provider,provider_txn_id,demo',
    );
    expect(lines).toHaveLength(1 + 6);
    expect(lines[1]).toMatch(/^2026-03-01 23:59:59,SUCCESS,USD,10\.00,Chan Sophea,,,Riverside,Counter,DEMO_SIMULATOR,RPT-/);
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(text).toContain('សុខ ចាន់');
    const pendingOnly = await request(http)
      .get(`${API}/reports/transactions.csv?from=${FROM}&to=${TO}&status=PENDING`)
      .set('Authorization', bearer(owner))
      .expect(200);
    expect(pendingOnly.text.trim().split('\r\n')).toHaveLength(2);
  });

  it.each(['km', 'en', 'zh'])('renders the sales report as a PDF in %s', async (lang) => {
    const res = await request(http)
      .get(`${API}/reports/sales.pdf?from=${FROM}&to=${TO}&granularity=week`)
      .set('Authorization', bearer(owner))
      .set('Accept-Language', lang)
      .buffer(true)
      .parse(buffer)
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="sales-report_2026-03-01_2026-03-31.pdf"');
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length).toBeGreaterThan(5_000);
  });

  it('rejects oversized ranges with a translated message', async () => {
    const res = await request(http)
      .get(`${API}/reports/sales?from=2025-01-01T00:00:00Z&to=2026-03-01T00:00:00Z`)
      .set('Authorization', bearer(owner))
      .set('Accept-Language', 'zh-CN,zh;q=0.9')
      .expect(400);
    expect(res.body).toMatchObject({ code: 'DATE_RANGE_TOO_LONG', message: '日期范围不能超过 366 天' });
  });

  describe('translated API errors', () => {
    it('translates existing English errors and adds a stable code', async () => {
      const res = await request(http)
        .post(`${API}/auth/login`)
        .set('Accept-Language', 'km-KH,km;q=0.9')
        .send({ email: 'nobody@test.onepay.local', password: 'Wrong-Passw0rd' })
        .expect(401);
      expect(res.body).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ' });
    });

    it('keeps field details in English for developers but says it plainly to users', async () => {
      const res = await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(owner))
        .set('Accept-Language', 'zh')
        .send({ name: 'x' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('部分信息无效，请检查后重试。');
      expect(res.body.details).toEqual(expect.arrayContaining([expect.stringMatching(/name/)]));
    });

    it('defaults to English and falls back to the original text for uncatalogued messages', async () => {
      const res = await request(http).get(`${API}/outlets/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`).set('Authorization', bearer(owner)).expect(404);
      expect(res.body).toMatchObject({ code: 'OUTLET_NOT_FOUND', message: 'Outlet not found' });
      const dup = await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(owner))
        .set('Accept-Language', 'fr-FR, km;q=0.5')
        .send({ name: 'Riverside again', code: 'RIVER' })
        .expect(409);
      expect(dup.body.code).toBe('DUPLICATE');
      expect(dup.body.message).toContain('ព័ត៌មាននេះមានរួចហើយ');
    });
  });
});
