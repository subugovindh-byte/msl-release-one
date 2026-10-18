import { test, expect } from '@playwright/test';

async function presentationApi(page, signedIn) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      return route.fulfill({
        status: signedIn ? 200 : 401,
        json: signedIn
          ? { user: { id: 1, username: 'preview', fullName: 'Presentation Preview', role: 'admin' } }
          : { error: 'Not signed in' },
      });
    }
    if (path === '/api/company') {
      return route.fulfill({ json: { company: { name: 'MODERNEX STONES LLP', gstin: 'TEST', hsn: '6802' } } });
    }
    if (path === '/api/reports/dashboard') {
      return route.fulfill({ json: {
        summary: {
          revenue_paise: 0, ar_paise: 0, collected_paise: 0, ap_paise: 0, gst_output_paise: 0,
          gst_itc_paise: 0, net_gst_paise: 0, stock_value_paise: 0, total_products: 0,
          invoice_count: 0, unpaid_count: 0, low_stock_count: 0,
        },
        charts: { weeklyRevenue: [], gradeMix: [], byKind: [], salesByKind: [] },
      } });
    }
    if (path === '/api/products') return route.fulfill({ json: { products: [], total: 0 } });
    if (path === '/api/customers') return route.fulfill({ json: { customers: [], total: 0 } });
    return route.fulfill({ status: 404, json: { error: `No presentation fixture for ${path}` } });
  });
}

async function checkFooterWidths(page) {
  const footer = page.getByRole('contentinfo', { name: 'Modernex footer' });
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await footer.scrollIntoViewIfNeeded();
    await expect.poll(() => footer.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
    })).toBe(true);
  }
}

test('signed-out pages use the shared footer and retain an explicit theme choice', async ({ page }, testInfo) => {
  await presentationApi(page, false);
  await page.goto('/login');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('button', { name: /Sign in/i })).toHaveCSS('border-radius', '0px');
  const footer = page.getByRole('contentinfo', { name: 'Modernex footer' });
  await expect(footer).toHaveCount(1);
  await expect(footer.getByRole('link')).toHaveCount(10);
  await footer.screenshot({ path: testInfo.outputPath('footer-desktop.png') });
  await checkFooterWidths(page);
  await footer.screenshot({ path: testInfo.outputPath('footer-mobile.png') });
  await footer.getByRole('button', { name: 'Back to top' }).click();
  await expect.poll(() => page.locator('.public-shell').evaluate(element => element.scrollTop)).toBe(0);
  await page.locator('.theme-btn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('signed-in footer navigates within Modernex and stays out of printed pages', async ({ page }, testInfo) => {
  await presentationApi(page, true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(37, 37, 38)');
  for (const selector of ['.theme-btn', '.refresh-btn', '.tb-logout']) {
    await expect(page.locator(selector)).toHaveCSS('border-radius', '0px');
  }
  const footer = page.getByRole('contentinfo', { name: 'Modernex footer' });
  await footer.scrollIntoViewIfNeeded();
  await footer.getByRole('link', { name: 'Help & handbook' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect.poll(() => page.locator('.main-scroll').evaluate(element => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: '2. First-Time Setup', exact: true }).click();
  const warning = page.locator('.warning-note').first();
  await expect(warning).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(warning).toHaveCSS('border-left-color', 'rgb(184, 184, 188)');
  await warning.screenshot({ path: testInfo.outputPath('neutral-warning.png') });
  await checkFooterWidths(page);
  await page.emulateMedia({ media: 'print' });
  await expect(footer).toBeHidden();
  expect(errors).toEqual([]);
});

test('POS keeps its workspace usable and the footer reachable above the mobile cart dock', async ({ page }, testInfo) => {
  await presentationApi(page, true);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/pos');
  await expect(page.locator('.pos-wrap')).toBeVisible();
  const collapse = page.getByTitle('Collapse cart', { exact: true });
  if (await collapse.count()) await collapse.click();
  const footer = page.getByRole('contentinfo', { name: 'Modernex footer' });
  await footer.scrollIntoViewIfNeeded();
  const backToTop = footer.getByRole('button', { name: 'Back to top' });
  await backToTop.scrollIntoViewIfNeeded();
  const footerButton = await backToTop.boundingBox();
  const cartDock = await page.getByTitle('Open cart', { exact: true }).boundingBox();
  expect(footerButton.y + footerButton.height).toBeLessThanOrEqual(cartDock.y);
  await backToTop.click();
  await expect.poll(() => page.locator('.main-scroll').evaluate(element => element.scrollTop)).toBe(0);
  await page.getByTitle('Open cart', { exact: true }).click();
  await expect(page.getByTitle('Collapse cart', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pos-mobile.png') });
});
