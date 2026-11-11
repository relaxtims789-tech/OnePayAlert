import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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
