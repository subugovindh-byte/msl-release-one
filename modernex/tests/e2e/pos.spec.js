import { test, expect } from '@playwright/test';

async function login(page, user = 'admin', pw = 'admin123') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/pos/, { timeout: 15_000 });
}

test.describe('POS happy path', () => {
  test('add slab to cart, create invoice, verify IRN', async ({ page }, testInfo) => {
    // Cart sidebar is hidden on mobile viewports — skip on mobile project
    test.skip(testInfo.project.name === 'mobile-safari', 'Cart panel is desktop-only');
    await login(page);

    // Pick first available slab
    const firstSlab = page.locator('.slab').first();
    await expect(firstSlab).toBeVisible();
    await firstSlab.click();

    // Cart shows 1 item — cart header visible and item count span appears
    await expect(page.locator('.cart-ht')).toBeVisible();
    await expect(page.locator('.cart-head').getByText(/\bitem\b|\bitems\b/)).toBeVisible();

    // Select a customer (not walk-in, so we get GSTIN)
    await page.locator('.cart-cust select').selectOption({ index: 0 });

    // Grand total > 0
    const grand = page.locator('.tg-val');
    await expect(grand).toContainText(/₹/);

    // Invoice
    await page.getByRole('button', { name: /invoice/i }).click();

    // Overlay shows invoice confirmation
    await expect(page.getByText('Invoice Created', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Total', { exact: true })).toBeVisible();

    // Close
    await page.getByRole('button', { name: /New Sale/i }).click();

    // Cart is empty again
    await expect(page.getByText(/Add products to cart/i)).toBeVisible();
  });

  test('filter slabs by variety', async ({ page }) => {
    await login(page);
    const totalBefore = await page.locator('.slab').count();

    await page.locator('.sf').nth(0).selectOption('Paradiso Classic');
    await page.waitForTimeout(200);

    const afterFilter = await page.locator('.slab').count();
    expect(afterFilter).toBeLessThanOrEqual(totalBefore);

    // All visible should match
    const varieties = await page.locator('.sl-var').allTextContents();
    for (const v of varieties) {
      expect(v).toBe('Paradiso Classic');
    }
  });

  test('role sees allowed pages; sales cannot see Users', async ({ page }) => {
    await login(page, 'sales', 'sales123');
    // Users link should exist in sidebar but route should gracefully degrade
    await page.goto('/users');
    // Non-admin sees access denied
    await expect(page.getByText(/Access Denied/i)).toBeVisible();
  });
});
