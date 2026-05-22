import { test, expect } from '@playwright/test';

async function login(page, user = 'admin', pw = 'admin123') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/pos/, { timeout: 15_000 });
}

test.describe('Invoice delivery', () => {
  test('invoice PDF endpoint returns a valid PDF', async ({ page, request }) => {
    await login(page);

    // Get the session cookie so API request is authenticated
    const cookies = await page.context().cookies();

    // Fetch the invoices list via API to pick one (use page.request so auth cookies are included)
    const listRes = await page.request.get('/api/invoices?limit=1');
    expect(listRes.ok()).toBeTruthy();
    const { invoices } = await listRes.json();
    test.skip(!invoices?.length, 'No seeded invoices to test PDF');

    const invoice = invoices[0];

    // Request the PDF
    const pdfRes = await page.request.get(`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`);
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');

    // First 4 bytes of a PDF file are "%PDF"
    const buffer = await pdfRes.body();
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
  });
});
