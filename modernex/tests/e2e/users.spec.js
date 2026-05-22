import { test, expect } from '@playwright/test';

async function login(page, user = 'admin', pw = 'admin123') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/pos/, { timeout: 15_000 });
}

test.describe('User management', () => {
  test('admin can view user list', async ({ page }) => {
    await login(page);
    await page.goto('/users');
    await expect(page.locator('.page-header h1')).toContainText('User Management');
    await expect(page.locator('.ag-row').first()).toBeVisible();
    // Seed admin must be visible
    await expect(page.getByText('admin').first()).toBeVisible();
  });

  test('create new user generates password', async ({ page }) => {
    await login(page);
    await page.goto('/users');

    await page.getByRole('button', { name: /new user/i }).click();
    const uniqueName = `testuser${Date.now().toString().slice(-6)}`;
    // Labels have no htmlFor — use class selectors
    await page.locator('input.fi').first().fill(uniqueName);
    await page.locator('input.fi').nth(1).fill('Test User');
    await page.locator('input[type=password].fi').fill('TestPass@123');
    await page.locator('select.fsel').selectOption('sales');
    await page.getByRole('button', { name: 'Create User' }).click();

    // Success toast appears
    await expect(page.locator('.toast-item')).toBeVisible();
    await expect(page.getByText(uniqueName).first()).toBeVisible();
  });

  test('non-admin sees access denied on /users', async ({ page }) => {
    await login(page, 'sales', 'sales123');
    await page.goto('/users');
    // Sales role cannot manage users — access denied page is shown
    await expect(page.getByText(/Access Denied/i)).toBeVisible();
    await expect(page.getByText(/Only administrators/i)).toBeVisible();
  });
});
