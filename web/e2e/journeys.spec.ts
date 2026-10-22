import { test, expect, type Page } from '@playwright/test';
import { createHmac, createHash } from 'node:crypto';

const password = 'BrowserPass123';
const errors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => { expect(errors.get(page) ?? [], 'Unhandled browser errors').toEqual([]); });
test.beforeEach(async ({ context, page }, info) => {
  const observed: string[] = [];
  errors.set(page, observed);
  page.on('pageerror', (error) => observed.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && /NotFoundError|Hydration failed|Minified React error/.test(message.text())) observed.push(message.text()); });
  const hash = createHash('sha256').update(info.testId + info.project.name).digest();
  // Distinct synthetic clients, with the real rate limiter left enabled.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${hash[0]}.${hash[1]}.${1 + hash[2] % 250}` });
});
async function registerBuyer(page: Page, email: string) {
  const response = await page.request.post('/api/auth/register', { data: { role: 'buyer', name: 'Browser Buyer', email, password } });
  expect(response.status(), await response.text()).toBe(200);
}
async function login(page: Page, email: string, pass = password) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
// Independent RFC-6238 calculation, not the implementation under test.
function totp(secret: string) {
  let bits = '';
  for (const char of secret) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  return String((hash.readUInt32BE(hash[19]! & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('vendor registers through the UI and activates a free storefront', async ({ page }, info) => {
  const apiHeaders: Record<string, string>[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) apiHeaders.push(r.headers()); });
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Lagos Browser Vendor');
  await page.getByLabel('Email', { exact: true }).fill(`vendor-${info.project.name}@browser.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Business name').fill(`Browser Shop ${info.project.name}`);
  await expect(page.locator('#category option[value="fashion"]')).toBeAttached();
  await page.getByLabel('What do you offer?').selectOption('fashion');
  await page.getByLabel('WhatsApp number').fill('08031111111');
  await page.getByLabel('City', { exact: true }).fill('Lagos');
  await page.getByRole('button', { name: 'Continue — choose a plan' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.locator('.onb-plan').first()).toBeVisible();
  await page.locator('.onb-plan').filter({ has: page.locator('.onb-plan-name', { hasText: /^Free$/ }) }).click();
  await page.getByRole('button', { name: 'Start on the free plan' }).click();
  await page.getByRole('link', { name: /Open.*dashboard|Go to.*dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const me = await page.request.get('/api/auth/me');
  const data = await me.json();
  expect(data.business.status).toBe('active');
  expect(data.business.plan_name).toBe('Free');
  expect(apiHeaders.length).toBeGreaterThan(0);
  for (const headers of apiHeaders) expect(headers).not.toHaveProperty('x-internal-secret');
  const session = (await page.context().cookies()).find((cookie) => cookie.name === 'cs_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
});

test('local QR enrolment and recovery-code sign-in work in the actual browser', async ({ page }, info) => {
  const email = `security-${info.project.name}@browser.test`;
  await registerBuyer(page, email);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Set up two-factor' }).click();
  const secret = await page.locator('.totp-secret').innerText();
  await expect(page.getByAltText('QR code for your authenticator app')).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(requests.some((url) => url.includes('qrserver.com') || url.includes('otpauth'))).toBe(false);
  await page.getByLabel('Code from your app').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(page.locator('.backup-codes code')).toHaveCount(10);
  const recovery = await page.locator('.backup-codes code').first().innerText();
  await page.request.post('/api/auth/logout');
  await login(page, email);
  const input = page.getByLabel('Authenticator or recovery code');
  await expect(input).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await input.fill(recovery);
  await expect(input).toHaveValue(recovery.toUpperCase());
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.request.post('/api/auth/logout');
  await login(page, email);
  await page.getByLabel('Authenticator or recovery code').fill(recovery);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /That code|Incorrect email/ })).toContainText('That code is not right');
});

test('password recovery through real forms is single-use and invalidates the old password', async ({ page }, info) => {
  const email = `reset-${info.project.name}@browser.test`;
  await registerBuyer(page, email);
  await page.goto('/forgot');
  await page.getByLabel('Email', { exact: true }).fill(email);
  const issued = page.waitForResponse((r) => r.url().endsWith('/api/auth/forgot') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const result = await (await issued).json();
  // Development-only link, no provider is impersonated and no real email sent.
  expect(result.dev_mode).toBe(true);
  const link = new URL(result.reset_url);
  await page.goto(link.pathname + link.search);
  await page.getByLabel('New password', { exact: true }).fill('ChangedBrowser123');
  await page.getByLabel('Confirm new password').fill('ChangedBrowser123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated — taking you to sign in…')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  const replay = await page.request.post('/api/auth/reset', { data: { token: link.searchParams.get('token'), password: 'AnotherPassword123' } });
  expect(replay.status()).toBe(400);
  await login(page, email, password);
  await expect(page.getByRole('alert').filter({ hasText: /That code|Incorrect email/ })).toContainText('Incorrect email or password');
  await page.getByLabel('Password', { exact: true }).fill('ChangedBrowser123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test('public landing page fits the viewport and protected routes stay private', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect((await page.request.get('/api/admin/health')).status()).toBe(401);
  await page.goto('/account/security');
  await expect(page).toHaveURL(/\/login/);
});

test('unconfigured Android association fails closed without invented certificate identity', async ({ request }) => {
  const response = await request.get('/.well-known/assetlinks.json');
  expect(response.status()).toBe(503);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'Android domain association is not configured.' });
});

test('billing checks and resumes one existing synthetic checkout, then shows its paid state', async ({ page }, info) => {
  const registered = await page.request.post('/api/auth/register', { data: {
    role: 'vendor', name: 'Checkout Browser Vendor', email: `checkout-${info.project.name}@browser.test`,
    password, business_name: `Checkout Shop ${info.project.name}`, category_slug: 'fashion', whatsapp_number: '08031111111',
  } });
  expect(registered.status(), await registered.text()).toBe(200);
  const free = await page.request.post('/api/vendor/payment-intent', { data: { plan_slug: 'free', method: 'bank_transfer' } });
  expect(free.status(), await free.text()).toBe(200);
  await page.goto('/dashboard/billing');
  let initializations = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/vendor/payment-intent' && request.method() === 'POST') initializations++;
  });
  await page.getByRole('button', { name: 'Pay with card', exact: true }).first().click();
  await expect(page).toHaveURL(/\/paystack\/mock\?ref=/);
  const checkoutUrl = page.url();
  const reference = new URL(checkoutUrl).searchParams.get('ref');
  expect(reference).toBeTruthy();
  // This is the explicit development-only checkout, not a real provider sandbox.
  await expect(page.getByText('DEMO MODE', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Cancel and go back' }).click();
  const recovery = page.getByRole('region', { name: `Recover payment ${reference}` });
  await expect(recovery).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload bank transfer proof/ })).toHaveCount(0);
  const check = page.waitForResponse((response) => /\/api\/vendor\/payments\/\d+\/recover$/.test(new URL(response.url()).pathname));
  await recovery.getByRole('button', { name: 'Check payment status' }).click();
  const checked = await check;
  expect(checked.status(), await checked.text()).toBe(200);
  expect((await checked.json()).status).toBe('pending');
  await expect(page.getByRole('status').filter({ hasText: 'This payment is not yet confirmed' })).toContainText('do not start another payment');
  await recovery.getByRole('button', { name: 'Resume same checkout' }).click();
  await expect(page).toHaveURL(checkoutUrl);
  expect(initializations).toBe(1);
  await page.getByRole('button', { name: 'Pay now (simulate)' }).click();
  await expect(page.getByText('Payment received and verified', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Go to billing', exact: true }).click();
  await expect(page.getByRole('region', { name: `Recover payment ${reference}` })).toHaveCount(0);
  const billing = await page.request.get('/api/vendor/plans');
  expect(billing.status()).toBe(200);
  const payments = (await billing.json()).payments.filter((payment: { reference: string }) => payment.reference === reference);
  expect(payments).toHaveLength(1);
  expect(payments[0].status).toBe('approved');
  await page.reload();
  await expect(page.getByRole('region', { name: `Recover payment ${reference}` })).toHaveCount(0);
  expect(initializations).toBe(1);
});
