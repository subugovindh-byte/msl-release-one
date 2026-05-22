import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login redirects to POS and shows brand', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('MODERNEX STONES LLP').first()).toBeVisible();

    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/pos/, { timeout: 15_000 });
    await expect(page.locator('.tb-brand')).toContainText('MODERNEX STONES LLP');
    await expect(page.locator('.sb-name')).toContainText(/Subramani|admin/i);
  });

  test('invalid credentials shows error toast', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('.toast-item')).toBeVisible();
  });

  test('logout returns to login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/pos/, { timeout: 15_000 });
    await page.locator('.sb-logout').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('theme toggle persists across reloads', async ({ page }) => {
    await page.goto('/login');

    const initial = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'));
    await page.locator('.theme-btn').click();
    const afterToggle = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'));
    expect(afterToggle).not.toBe(initial);

    await page.reload();
    const afterReload = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'));
    expect(afterReload).toBe(afterToggle);
  });
});
