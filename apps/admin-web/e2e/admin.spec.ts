import { expect, test, type Page } from '@playwright/test';
import { API, SUPER_ADMIN, SUPPORT, WEB_PORT } from './fixtures';

test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const merchant = { email: `owner.${stamp}@admin-e2e.onepay.local`, password: 'Str0ngPassw0rd', company: `Kampot Pepper ${stamp}` };
const planCode = `E2E_${stamp}`.slice(0, 40);
const planName = `Pepper Growth ${stamp}`;

async function signIn(page: Page, email: string, password: string, expectSuccess = true) {
  await page.context().addCookies([{ name: 'op_locale', value: 'en', url: `http://localhost:${WEB_PORT}` }]);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (expectSuccess) await expect(page).toHaveURL(/\/overview$/);
}

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${API}/auth/register`, {
    data: { fullName: 'Pepper Owner', email: merchant.email, password: merchant.password, companyName: merchant.company },
  });
  expect(res.status()).toBe(201);
});

test('refuses merchant accounts at the staff sign-in', async ({ page, context }) => {
  await signIn(page, merchant.email, merchant.password, false);
  await expect(page.getByText('This account is not a MysoftKH staff account.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).map((c) => c.name)).not.toContain('opa_rt');
});

test('super admin sees platform KPIs with its own session cookies', async ({ page, context }) => {
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
  await expect(page.getByTestId('overview-kpis')).toContainText('Merchants');
  await expect(page.getByTestId('overview-kpis')).toContainText('Real payments today · USD');
  await expect(page.getByText(merchant.company).first()).toBeVisible();
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).toContain('opa_rt'); // separate from the merchant dashboard's op_rt
  expect(names).not.toContain('op_rt');
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/opa_rt|opa_at/);
});

test('finds a merchant and reviews its account', async ({ page }) => {
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.getByRole('link', { name: 'Merchants' }).click();
  await page.getByRole('searchbox').fill(merchant.email);
  const row = page.getByTestId('merchants-table').getByRole('row').filter({ hasText: merchant.company });
  await expect(row).toHaveCount(1);
  await row.getByRole('link', { name: merchant.company }).click();

  await expect(page.getByTestId('merchant-name')).toHaveText(merchant.company);
  await expect(page.getByTestId('merchant-status')).toContainText('Active');
  await expect(page.getByTestId('subscription')).toContainText('STARTER');
  await expect(page.getByTestId('subscription')).toContainText('Trial');
  await expect(page.getByTestId('members-table')).toContainText('Owner');
  await expect(page.getByText('MAIN', { exact: true })).toBeVisible();
});

test('suspends a merchant with a reason, blocks its users, and audits it', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { email: merchant.email, password: merchant.password } });
  const { accessToken } = await login.json();

  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.goto('/merchants');
  await page.getByRole('searchbox').fill(merchant.email);
  await page.getByRole('link', { name: merchant.company }).click();
  await page.getByRole('button', { name: 'Suspend' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('lose access immediately');
  await dialog.getByLabel(/Reason/).fill('KYC documents expired');
  await dialog.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText('Merchant status updated')).toBeVisible();
  await expect(page.getByTestId('merchant-status')).toContainText('Suspended');

  const blocked = await request.get(`${API}/outlets`, { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(blocked.status()).toBe(403);

  await page.getByRole('link', { name: 'View audit log' }).click();
  const entry = page.getByTestId('audit-table').getByRole('row').filter({ hasText: 'platform.company.status_changed' }).first();
  await expect(entry).toContainText(SUPER_ADMIN.email);
  await entry.click();
  await expect(page.getByTestId('audit-details')).toContainText('KYC documents expired');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  await page.goBack();
  await page.getByRole('button', { name: 'Reactivate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivate' }).click();
  await expect(page.getByTestId('merchant-status')).toContainText('Active');
  const allowed = await request.get(`${API}/outlets`, { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(allowed.status()).toBe(200);
});

test('creates a plan and moves the merchant onto it', async ({ page }) => {
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.getByRole('link', { name: 'Plans' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code').fill(planCode);
  await dialog.getByLabel('Name').fill(planName);
  await dialog.getByLabel('Price').fill('19.5');
  await dialog.getByLabel('Outlets').fill('4');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Plan created')).toBeVisible();
  await expect(page.getByTestId('plans-table').getByRole('row').filter({ hasText: planCode })).toContainText('$19.50');

  await page.goto('/merchants');
  await page.getByRole('searchbox').fill(merchant.email);
  await page.getByRole('link', { name: merchant.company }).click();
  await page.getByTestId('subscription').locator('..').getByRole('button', { name: 'Edit' }).click();
  const sub = page.getByRole('dialog');
  await sub.getByLabel('Plan').selectOption({ label: `${planName} · $19.50 / month` });
  await sub.getByLabel('Status').selectOption('ACTIVE');
  await sub.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Subscription updated')).toBeVisible();
  await expect(page.getByTestId('subscription')).toContainText(planCode);
  await expect(page.getByTestId('subscription')).toContainText('$19.50');
});

let invoiceNumber = '';

test('confirms a merchant invoice payment, which activates the plan', async ({ page, request }) => {
  // A second merchant (the first one is suspended above) chooses the Business plan.
  const email = `billing.${stamp}@admin-e2e.onepay.local`;
  const reg = await request.post(`${API}/auth/register`, {
    data: { fullName: 'Billing Owner', email, password: merchant.password, companyName: `Mekong Tea ${stamp}` },
  });
  expect(reg.status()).toBe(201);
  const auth = { Authorization: `Bearer ${(await reg.json()).accessToken}` };
  const plans = (await (await request.get(`${API}/billing`, { headers: auth })).json()).plans as { id: string; code: string }[];
  const inv = await request.post(`${API}/billing/checkout`, { headers: auth, data: { planId: plans.find((p) => p.code === 'BUSINESS')!.id } });
  expect(inv.status()).toBe(200);
  invoiceNumber = (await inv.json()).number;

  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.getByRole('link', { name: 'Invoices' }).click();
  const row = page.getByTestId('invoices-table').getByRole('row').filter({ hasText: invoiceNumber });
  await expect(row).toContainText(`Mekong Tea ${stamp}`);
  await expect(row).toContainText('$29.00');
  await expect(row).toContainText('Unpaid');
  await page.getByTestId(`mark-paid-${invoiceNumber}`).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`Mekong Tea ${stamp}`);
  await dialog.getByTestId('payment-reference').fill('ABA-E2E-778812');
  await page.getByTestId('confirm-paid').click();
  await expect(page.getByText(`Payment confirmed for ${invoiceNumber}`)).toBeVisible();

  await page.getByRole('tab', { name: 'Paid', exact: true }).click();
  const paid = page.getByTestId('invoices-table').getByRole('row').filter({ hasText: invoiceNumber });
  await expect(paid).toContainText('ABA-E2E-778812');
  const billing = await (await request.get(`${API}/billing`, { headers: auth })).json();
  expect(billing.subscription).toMatchObject({ status: 'ACTIVE', plan: { code: 'BUSINESS' } });
});

test('registers a soundbox, shows its credentials once, and can disable it', async ({ page }) => {
  const serial = `SBX-ADM${String(stamp).slice(-6)}`;
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.getByRole('link', { name: 'Soundboxes' }).click();
  await page.getByTestId('register-device').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Serial number').fill(serial.toLowerCase());
  await dialog.getByRole('button', { name: 'Register soundbox' }).click();

  const creds = page.getByRole('dialog');
  await expect(creds).toContainText('Save these credentials now');
  await expect(creds.getByTestId('mqtt-username')).toHaveText(serial);
  expect(((await creds.getByTestId('mqtt-password').textContent()) ?? '').length).toBeGreaterThanOrEqual(32);
  await expect(creds.getByTestId('claim-code')).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const password = (await creds.getByTestId('mqtt-password').textContent()) ?? '';
  await creds.getByRole('button', { name: 'I have saved them' }).click();

  const row = page.getByTestId('devices-table').getByRole('row').filter({ hasText: serial });
  await expect(row).toContainText('In stock');
  await expect(row).toContainText('Offline');
  expect(await page.content()).not.toContain(password);

  await row.getByRole('button', { name: 'Disable' }).click();
  await expect(page.getByText(`${serial} disabled`)).toBeVisible();
  await expect(row).toContainText('Disabled');
});

test('shows system health and provider catalogue', async ({ page }) => {
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.getByRole('link', { name: 'System health' }).click();
  await expect(page.getByTestId('health-status')).toBeVisible();
  await expect(page.getByText('Database').locator('..').locator('..')).toContainText('Up');
  // Bakong KHQR: the test API has no Bakong token, so it says payments are simulated (live states are covered by API e2e).
  const khqr = page.getByTestId('khqr-health');
  await expect(khqr).toHaveAttribute('data-status', 'simulated');
  await expect(khqr).toContainText('Simulated: no Bakong token, demo payments only');
  await page.getByRole('link', { name: 'Banks & gateways' }).click();
  const table = page.getByTestId('providers-table');
  await expect(table.getByRole('row').filter({ hasText: 'ABA Bank' })).toContainText('Awaiting integration');
  await expect(table.getByRole('row').filter({ hasText: 'Signed Webhook' })).toContainText('Live');
});

test('support staff get a read-only console', async ({ page }) => {
  await signIn(page, SUPPORT.email, SUPPORT.password);
  await expect(page.getByText('Read-only (Support)').first()).toBeVisible();
  await page.goto('/merchants');
  await page.getByRole('searchbox').fill(merchant.email);
  await page.getByRole('link', { name: merchant.company }).click();
  await expect(page.getByTestId('merchant-name')).toHaveText(merchant.company);
  await expect(page.getByRole('button', { name: 'Suspend' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close account' })).toHaveCount(0);
  await page.goto('/plans');
  await expect(page.getByTestId('plans-table')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New plan' })).toHaveCount(0);
  await page.goto('/providers');
  await expect(page.getByTestId('providers-table')).toContainText('ABA Bank');
  await expect(page.getByRole('button', { name: 'Disable' })).toHaveCount(0);
  await page.goto('/invoices');
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await expect(page.getByTestId('invoices-table')).toContainText(invoiceNumber);
  await expect(page.getByRole('button', { name: 'Confirm payment' })).toHaveCount(0);
});

test('switches the console to Khmer', async ({ page }) => {
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.getByTestId('language-switcher').first().selectOption('km');
  await expect(page.getByRole('link', { name: 'អាជីវករ' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ទិដ្ឋភាពទូទៅនៃវេទិកា' })).toBeVisible();
  await page.getByTestId('language-switcher').first().selectOption('en');
});

test('signing out protects the console', async ({ page }) => {
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(page).toHaveURL(/\/overview$/);
  await page.getByTestId('sign-out').first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/merchants');
  await expect(page).toHaveURL(/\/login$/);
  // The proxy only reaches platform endpoints; tenant endpoints are not proxied at all.
  expect((await page.request.get('/api/proxy/outlets')).status()).toBe(404);
});
