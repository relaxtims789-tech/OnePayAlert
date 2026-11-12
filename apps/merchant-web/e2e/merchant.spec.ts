import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API_URL, BILLING_STAFF } from './fixtures';

/**
 * One merchant's journey through the real stack. Tests run in order and share the owner
 * account created in the first test.
 */
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const owner = { email: `owner.${stamp}@e2e.onepay.local`, password: 'Str0ngPassw0rd', name: 'Sok Dara', company: `Dara Coffee ${stamp}` };
const cashier = { email: `cashier.${stamp}@e2e.onepay.local`, password: 'Cashier0ne2026', name: 'Chan Cashier' };

async function english(context: BrowserContext) {
  await context.addCookies([{ name: 'op_locale', value: 'en', url: 'http://localhost:3100' }]);
}

async function signIn(page: Page, email: string, password: string) {
  await english(page.context());
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('registers a merchant and lands on the onboarding dashboard', async ({ page }) => {
  await english(page.context());
  await page.goto('/register');
  await page.getByLabel('Business name').fill(owner.company);
  await page.getByLabel('Your full name').fill(owner.name);
  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password').fill(owner.password);
  await page.getByRole('button', { name: 'Create a merchant account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Hello, Sok' })).toBeVisible();
  await expect(page.getByText('Connect your first bank account')).toBeVisible();
  await expect(page.getByText(owner.company)).toBeVisible();
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'live');

  // Tokens live only in httpOnly cookies.
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/op_rt|op_at/);
});

test('rejects bad credentials and does not reveal accounts on password reset', async ({ page }) => {
  await english(page.context());
  await page.goto('/login');
  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password').fill('Wr0ngPassword!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible();

  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(`nobody.${stamp}@e2e.onepay.local`);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/If an account exists for this email/)).toBeVisible();
});

/** What MysoftKH staff do in the admin console once the transfer arrives — through the real API. */
async function confirmPayment(request: APIRequestContext, invoiceNumber: string) {
  const login = await request.post(`${API_URL}/auth/login`, { data: { email: BILLING_STAFF.email, password: BILLING_STAFF.password } });
  expect(login.ok()).toBeTruthy();
  const auth = { Authorization: `Bearer ${(await login.json()).accessToken}` };
  const open = await (await request.get(`${API_URL}/platform/invoices?status=OPEN&pageSize=100`, { headers: auth })).json();
  const invoice = open.items.find((i: { number: string }) => i.number === invoiceNumber);
  expect(invoice).toBeTruthy();
  const paid = await request.post(`${API_URL}/platform/invoices/${invoice.id}/mark-paid`, {
    headers: auth,
    data: { paymentMethod: 'BANK_TRANSFER', paymentReference: 'E2E-TRANSFER' },
  });
  expect(paid.ok()).toBeTruthy();
}

test('explains the trial plan limit; a confirmed Business invoice lifts it', async ({ page, request }) => {
  await signIn(page, owner.email, owner.password);
  await page.getByRole('link', { name: 'Outlets' }).click();
  await page.getByRole('button', { name: 'Add outlet' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Riverside');
  await dialog.getByLabel('Code').fill('river');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Your Starter plan allows up to 1 active outlets');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('link', { name: 'Plan & billing' }).click();
  await expect(page.getByTestId('current-plan')).toContainText('Starter');
  await expect(page.getByTestId('current-plan')).toContainText('Free trial');
  await expect(page.getByTestId('usage')).toContainText('1 of 1');
  await page.getByTestId('choose-BUSINESS').click();
  await expect(page.getByRole('dialog')).toContainText('$29.00');
  await page.getByTestId('confirm-checkout').click();

  const invoiceCard = page.getByTestId('open-invoice');
  await expect(invoiceCard).toContainText('$29.00');
  await expect(invoiceCard).toContainText('How to pay');
  const invoiceNumber = (/INV-\d{4}-\d{6}/.exec((await invoiceCard.textContent()) ?? '') ?? [''])[0];
  expect(invoiceNumber).not.toBe('');
  // Choosing a plan alone unlocks nothing.
  await expect(page.getByTestId('current-plan')).toContainText('Starter');

  await confirmPayment(request, invoiceNumber);
  await page.reload();
  await expect(page.getByTestId('current-plan')).toContainText('Business');
  await expect(page.getByTestId('current-plan')).toContainText('Active');
  await expect(page.getByTestId('invoices')).toContainText('Paid');
  await expect(page.getByTestId('usage')).toContainText('1 of 5');
});

test('creates an outlet', async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.getByRole('link', { name: 'Outlets' }).click();
  await page.getByRole('button', { name: 'Add outlet' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Riverside');
  await dialog.getByLabel('Code').fill('river');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Outlet created')).toBeVisible();
  await expect(page.getByTestId('outlets-table')).toContainText('Riverside');
  await expect(page.getByTestId('outlets-table')).toContainText('RIVER');
});

test('adds a cashier restricted to one outlet', async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.getByRole('link', { name: 'Employees' }).click();
  await page.getByRole('button', { name: 'Add employee' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(cashier.name);
  await dialog.getByLabel('Email').fill(cashier.email);
  await dialog.getByLabel('Role').selectOption('CASHIER');
  await dialog.getByLabel('Temporary password').fill(cashier.password);
  await dialog.getByLabel('Riverside').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Employee added')).toBeVisible();
  const row = page.getByTestId('employees-table').getByRole('row').filter({ hasText: cashier.email });
  await expect(row).toContainText('Cashier');
  await expect(row).toContainText('Riverside');
});

test('a demo payment appears on the live dashboard in another tab without reloading', async ({ page, context }) => {
  await signIn(page, owner.email, owner.password);
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'live');

  const admin = await context.newPage();
  await admin.goto('/bank-connections');
  await admin.getByRole('button', { name: 'Connect account' }).first().click();
  await admin.getByTestId('provider-DEMO_SIMULATOR').click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Connect account' }).click();
  await expect(admin.getByText('Account connected')).toBeVisible();

  await admin.getByRole('button', { name: 'Simulate payment' }).click();
  const sim = admin.getByRole('dialog');
  await sim.getByLabel(/Amount/).fill('12.50');
  await sim.getByLabel(/Payer name/).fill('Chan Sophea');
  await sim.getByRole('button', { name: 'Simulate payment' }).click();
  await expect(admin.getByText('Demo payment sent')).toBeVisible();

  // The first tab updates in real time: feed, toast and today's total.
  const item = page.getByTestId('feed-item').filter({ hasText: 'Chan Sophea' });
  await expect(item).toBeVisible();
  await expect(item).toContainText('+$12.50');
  await expect(item).toContainText('Demo');
  await expect(page.getByText('New payment: $12.50')).toBeVisible();
  await expect(page.getByText('Received today · USD').locator('..').locator('..')).toContainText('$12.50');
});

test('filters transactions and shows details', async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.getByRole('link', { name: 'Transactions' }).click();
  const table = page.getByTestId('transactions-table');
  await expect(table).toContainText('Chan Sophea');
  await expect(table).toContainText('$12.50');

  await page.getByRole('row').filter({ hasText: 'Chan Sophea' }).click();
  const details = page.getByRole('dialog');
  await expect(details).toContainText('Transaction details');
  await expect(details).toContainText('Simulated (demo)');
  await details.getByRole('button', { name: 'Close' }).click();

  await page.getByLabel('Status').selectOption('FAILED');
  await expect(page.getByText('No transactions found')).toBeVisible();
  await page.getByLabel('Status').selectOption('');
  await page.getByRole('searchbox').fill('no-such-payer-xyz');
  await expect(page.getByText('No transactions found')).toBeVisible();
});

test('reports totals and downloads CSV and PDF exports', async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByTestId('report-totals')).toContainText('$12.50');
  await expect(page.getByTestId('by-provider')).toContainText('$12.50');

  const csv = page.waitForEvent('download');
  await page.getByTestId('export-csv').click();
  expect((await csv).suggestedFilename()).toMatch(/^payments_\d{4}-\d{2}-\d{2}\.csv$/);

  const pdf = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  expect((await pdf).suggestedFilename()).toMatch(/^sales-report_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.pdf$/);

  // An impossible custom range is caught before asking the server.
  await page.getByRole('tab', { name: 'Custom' }).click();
  await page.getByTestId('report-from').fill('2026-03-10');
  await page.getByTestId('report-to').fill('2026-03-01');
  await expect(page.getByText('The start date must be on or before the end date.')).toBeVisible();
  await expect(page.getByTestId('export-pdf')).toBeDisabled();
});

test('adds a soundbox with the code from its box and changes its settings', async ({ page, request }) => {
  // MysoftKH registers the device before it ships (through the real API).
  const login = await request.post(`${API_URL}/auth/login`, { data: { email: BILLING_STAFF.email, password: BILLING_STAFF.password } });
  const auth = { Authorization: `Bearer ${(await login.json()).accessToken}` };
  const serial = `SBX-E2E${String(stamp).slice(-6)}`;
  const reg = await request.post(`${API_URL}/platform/devices`, { headers: auth, data: { serialNumber: serial, model: 'OPA-SB1' } });
  expect(reg.status()).toBe(201);
  const { claimCode } = await reg.json();

  await signIn(page, owner.email, owner.password);
  await page.getByRole('link', { name: 'Soundboxes' }).click();
  await expect(page.getByText('No soundbox yet')).toBeVisible();
  await page.getByTestId('add-device').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Serial number').fill(serial);
  await dialog.getByLabel('Claim code').fill('ZZZZ-ZZZZ');
  await dialog.getByRole('button', { name: 'Add soundbox' }).click();
  await expect(dialog.getByRole('alert')).toContainText('do not match a device that can be added');
  await dialog.getByLabel('Claim code').fill(claimCode);
  await dialog.getByLabel('Name (optional)').fill('Front counter');
  await dialog.getByLabel('Announces payments of').selectOption({ label: 'Riverside' });
  await dialog.getByRole('button', { name: 'Add soundbox' }).click();
  await expect(page.getByText('Soundbox added')).toBeVisible();

  const card = page.getByTestId('device-card').filter({ hasText: 'Front counter' });
  await expect(card).toContainText(serial);
  await expect(card).toContainText('Riverside');
  await expect(card).toContainText('Offline');
  await expect(card).toContainText('Not connected yet');

  await card.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog').getByLabel('Announcement language').selectOption('en');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Soundbox updated')).toBeVisible();
  await expect(card).toContainText('English');
});

test('connecting a signed-webhook gateway shows the secret exactly once', async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.goto('/bank-connections');
  await page.getByRole('button', { name: 'Connect account' }).first().click();
  await expect(page.getByTestId('provider-ABA')).toContainText('Integration coming soon');
  await page.getByTestId('provider-ONEPAY_WEBHOOK').click();
  await page.getByRole('dialog').getByLabel('Account label').fill('Gateway USD');
  await page.getByRole('dialog').getByRole('button', { name: 'Connect account' }).click();

  const secretDialog = page.getByRole('dialog');
  await expect(secretDialog).toContainText('Save your webhook credentials');
  const secret = (await secretDialog.getByTestId('secret-value').nth(1).textContent()) ?? '';
  expect(secret).toMatch(/^whsec_/);
  await secretDialog.getByRole('button', { name: 'I have saved it' }).click();

  const card = page.getByTestId('connection-card').filter({ hasText: 'Gateway USD' });
  await expect(card).toContainText('Pending');
  await expect(card.getByRole('button', { name: 'Rotate secret' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Gateway USD')).toBeVisible();
  expect(await page.content()).not.toContain(secret);
});

test('switches the whole interface to Khmer and remembers it', async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.getByTestId('language-switcher').first().selectOption('km');
  await expect(page.getByRole('link', { name: 'ផ្ទាំងគ្រប់គ្រង' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'ប្រតិបត្តិការ' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'km');
  await page.getByTestId('language-switcher').first().selectOption('en');
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
});

test('a cashier only sees what their role and outlet allow (in their own language)', async ({ page }) => {
  await signIn(page, cashier.email, cashier.password);
  // Employees default to Khmer; the profile language drives the UI after sign-in.
  const nav = page.getByRole('navigation', { name: 'Main' }).first();
  await expect(nav.getByRole('link', { name: 'ប្រតិបត្តិការ' })).toBeVisible(); // Transactions
  await expect(nav.getByRole('link', { name: 'សាខា' })).toBeVisible(); // Outlets (read-only)
  await expect(nav.getByRole('link', { name: 'បុគ្គលិក' })).toHaveCount(0); // Employees
  await expect(nav.getByRole('link', { name: 'ការភ្ជាប់ធនាគារ' })).toHaveCount(0); // Bank connections

  // The demo payment was not attributed to Riverside, so the cashier must not see it.
  await nav.getByRole('link', { name: 'ប្រតិបត្តិការ' }).click();
  await expect(page.getByText('រកមិនឃើញប្រតិបត្តិការ')).toBeVisible(); // No transactions found

  // Outlets: only Riverside, and no management buttons.
  await nav.getByRole('link', { name: 'សាខា' }).click();
  await expect(page.getByTestId('outlets-table')).toContainText('Riverside');
  await expect(page.getByTestId('outlets-table')).not.toContainText('Main Outlet');
  await expect(page.getByRole('button', { name: 'បន្ថែមសាខា' })).toHaveCount(0); // Add outlet

  // Typing a forbidden URL still gets no data: the API refuses.
  await page.goto('/employees');
  await expect(page.getByText('អ្នកមិនមានសិទ្ធិធ្វើសកម្មភាពនេះទេ។')).toBeVisible(); // permission denied
});

test('silently refreshes an expired access token', async ({ page, context }) => {
  await signIn(page, owner.email, owner.password);
  const before = (await context.cookies()).find((c) => c.name === 'op_rt')?.value;
  await context.clearCookies({ name: 'op_at' });
  await page.goto('/transactions');
  await expect(page.getByTestId('transactions-table')).toContainText('Chan Sophea');
  const after = await context.cookies();
  expect(after.find((c) => c.name === 'op_at')).toBeTruthy();
  expect(after.find((c) => c.name === 'op_rt')?.value).not.toBe(before);
});

test('signing out ends the session and protects every page', async ({ page }) => {
  await signIn(page, owner.email, owner.password);
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  const res = await page.request.get('/api/proxy/auth/me');
  expect(res.status()).toBe(401);
});
