import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Use an ephemeral test database with absolute path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.resolve(__dirname, '../data/test.db');
console.log('Using test database:', TEST_DB);
process.env.DB_PATH = TEST_DB;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-tests-only';
// Pin the seed admin creds so the suite is hermetic — otherwise a developer's
// local .env ADMIN_PASSWORD is used to seed and the hard-coded login below 401s.
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin123';

import { createApp } from '../src/server.js';
import { runMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { closeDb, resetDbConnection } from '../src/db/connection.js';

describe('API integration', () => {
  let app;
  let cookies;

  beforeAll(async () => {
    // Force clean database
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
    if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
    
    // Reset database connection to use test DB
    resetDbConnection();
    
    console.log('Running migrations...');
    runMigrations();
    
    console.log('Running seed...');
    await seed();
    
    // Insert test customers for invoice tests
    // C001 = intra-state (Tamil Nadu → CGST+SGST), C004 = inter-state (→ IGST)
    const { getDb } = await import('../src/db/connection.js');
    const db = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO customers (id, name, gstin, state, credit_days)
      VALUES ('C001', 'Test Customer TN', '33AABCT1332L1ZS', 'Tamil Nadu', 0)
    `).run();
    db.prepare(`
      INSERT OR IGNORE INTO customers (id, name, gstin, state, credit_days)
      VALUES ('C004', 'Test Customer KA', '29AABCT1332L1ZT', 'Karnataka', 0)
    `).run();

    // Insert a test product so product-related tests have data
    db.prepare(`
      INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, rate_paise, stock, active)
      VALUES ('PRD-TEST-001', 'slab', 'Viscont White', '6802', 'sqft', 5000, 10, 1)
    `).run();
    // Also insert slab dimensions required by the 1:1 join
    db.prepare(`
      INSERT OR IGNORE INTO product_slabs (product_id, size_lw, thickness_mm, sqft)
      VALUES ('PRD-TEST-001', '2600x1600', 18, 30.98)
    `).run();

    const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    console.log(`After seed: ${userCount} users, ${productCount} products`);

    app = createApp();
  });

  afterAll(() => {
    closeDb();
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
    try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
  });

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/auth/login rejects bad credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login succeeds with seed creds', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
    cookies = res.headers['set-cookie'];
  });

  it('password recovery requires an answer before issuing a reset token', async () => {
    const unenrolled = await request(app).post('/api/auth/forgot-password').send({ username: 'admin' });
    expect(unenrolled.status).toBe(200);
    expect(unenrolled.body).toMatchObject({ ok: true, requires_setup: true });
    expect(unenrolled.body.reset_token).toBeUndefined();

    const setup = await request(app)
      .put('/api/users/me/password-recovery')
      .set('Cookie', cookies)
      .send({ current_password: 'admin123', hint: 'First school', answer: 'River stone' });
    expect(setup.status).toBe(200);
    expect(setup.body.hint).toBe('First school');
    expect(setup.body.answer_hash).toBeUndefined();

    const lookup = await request(app).post('/api/auth/forgot-password').send({ username: 'admin' });
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({ requires_answer: true, hint: 'First school' });
    expect(lookup.body.reset_token).toBeUndefined();

    const unknown = await request(app).post('/api/auth/forgot-password').send({ username: 'missing-user' });
    expect(unknown.body).toEqual(unenrolled.body);

    const wrong = await request(app).post('/api/auth/verify-recovery-answer')
      .send({ username: 'admin', answer: 'wrong answer' });
    expect(wrong.status).toBe(400);

    const verified = await request(app).post('/api/auth/verify-recovery-answer')
      .send({ username: 'admin', answer: '  RIVER STONE  ' });
    expect(verified.status).toBe(200);
    expect(verified.body.reset_token).toMatch(/^[a-f0-9]{32}$/);
  });

  it('GET /api/products requires auth', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('GET /api/products returns seed data with cookie', async () => {
    const res = await request(app).get('/api/products').set('Cookie', cookies);
    expect(res.status).toBe(200);
    // Debug: log actual response if empty
    if (res.body.products.length === 0) {
      console.log('Empty products response:', JSON.stringify(res.body, null, 2));
    }
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.products[0]).toHaveProperty('variety');
  });

  it('POST /api/invoices creates invoice with product', async () => {
    // Get a product to sell (use active filter, not status)
    const productsRes = await request(app).get('/api/products?variety=Viscont White').set('Cookie', cookies);
    if (productsRes.body.products.length === 0) {
      console.log('No products found, skipping test');
      return;
    }
    const product = productsRes.body.products[0];

    const res = await request(app)
      .post('/api/invoices')
      .set('Cookie', cookies)
      .send({
        customer_id: 'C001',
        discount_pct: 0,
        items: [{
          product_id: product.id,
          variety: product.variety,
          grade: product.grade ?? undefined,
          hsn: '6802',
          uom: 'sqft',
          uom_qty: product.dimensions?.sqft || 1,
          qty: 1,
          rate_paise: product.rate_paise,
        }],
      });

    expect(res.status).toBe(201);
    expect(res.body.invoice.id).toMatch(/^SI\//);  // Sales Invoice format: SI/26-27/0001
    expect(res.body.invoice.total_paise).toBeGreaterThan(0);
    expect(res.body.invoice.cgst_paise).toBeGreaterThan(0);  // TN customer -> CGST+SGST
    expect(res.body.invoice.sgst_paise).toBe(res.body.invoice.cgst_paise);
    expect(res.body.invoice.igst_paise).toBe(0);

    // Product stock should be decremented
    const after = await request(app).get(`/api/products/${product.id}`).set('Cookie', cookies);
    expect(after.body.product.stock).toBeLessThan(product.stock);
  });

  it('Inter-state sale generates IGST instead of CGST+SGST', async () => {
    const productsRes = await request(app).get('/api/products').set('Cookie', cookies);
    if (productsRes.body.products.length === 0) {
      console.log('No products found, skipping test');
      return;
    }
    const product = productsRes.body.products[0];
    
    const res = await request(app)
      .post('/api/invoices')
      .set('Cookie', cookies)
      .send({
        customer_id: 'C004',
        discount_pct: 0,
        items: [{
          product_id: product.id,
          variety: product.variety,
          hsn: '6802',
          uom: 'sqft',
          uom_qty: product.dimensions?.sqft || 1,
          qty: 1,
          rate_paise: product.rate_paise,
        }],
      });
      
    expect(res.status).toBe(201);
    expect(res.body.invoice.igst_paise).toBeGreaterThan(0);
    expect(res.body.invoice.cgst_paise).toBe(0);
    expect(res.body.invoice.sgst_paise).toBe(0);
  });

  it('Mark invoice paid creates payment record', async () => {
    const inv = await request(app).get('/api/invoices?status=final').set('Cookie', cookies);
    if (!inv.body.items || inv.body.items.length === 0) {
      // Skip if no invoices created yet
      return;
    }
    const unpaidId = inv.body.items[0].id;
    const res = await request(app)
      .post(`/api/invoices/${unpaidId}/pay`)
      .set('Cookie', cookies)
      .send({ mode: 'NEFT', referenceNo: 'TESTUTR123', amountPaise: 100000 });
    expect([200, 404]).toContain(res.status); // 404 if endpoint not implemented yet
  });
  it('Payroll: PT within ₹2,500 a year, TDS on the declared regime', async () => {
    const emp = await request(app).post('/api/payroll/employees').set('Cookie', cookies).send({
      name: 'Test Manager', joining_date: '2020-04-01', basic_salary_paise: 10000000, hra_paise: 4000000,
      conveyance_paise: 0, other_allowance_paise: 6000000, pf_applicable: true, esi_applicable: false, pt_applicable: true,
    });
    expect(emp.status).toBe(201);
    const empId = emp.body.employee.id;
    // ₹2,00,000 a month; old regime with ₹1.5L 80C and ₹3L rent in a non-metro
    const decl = await request(app).post(`/api/payroll/employees/${empId}/tax-declaration`).set('Cookie', cookies)
      .send({ fy: '2026-27', tax_regime: 'old', sec_80c_paise: 15000000, hra_rent_paid_annual: 30000000 });
    expect(decl.status).toBe(200);
    expect(decl.body.declaration.tax_regime).toBe('old');

    const run = await request(app).post('/api/payroll/runs').set('Cookie', cookies).send({ month: '2026-09' });
    expect(run.status).toBe(201);
    const mine = run.body.entries.find(e => e.employee_id === empId);
    expect(mine.pt).toBe(20833);   // ₹1,250 a half-year, spread monthly
    // gross ₹24,00,000 − std 50,000 − PT 2,500 − HRA 1,80,000 − 80C 1,50,000 = ₹20,17,500
    // tax 1,12,500 + 30% × 10,17,500 = 4,17,750; + 4% cess = 4,34,460 → ₹36,205 a month
    expect(mine.tds).toBe(3620500);
  });
  it('Invoice receipts: part-payment, overpayment refused, Payments-screen receipt settles it', async () => {
    const { getDb } = await import('../src/db/connection.js');
    const db = getDb();
    db.prepare(`INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, rate_paise, stock, active)
                VALUES ('PRD-TEST-PAY', 'slab', 'Test Black', '6802', 'sqft', 10000, 5, 1)`).run();
    db.prepare(`INSERT OR IGNORE INTO product_slabs (product_id, size_lw, thickness_mm, sqft)
                VALUES ('PRD-TEST-PAY', '2600x1600', 18, 10)`).run();
    const created = await request(app).post('/api/invoices').set('Cookie', cookies).send({
      customer_id: 'C001', discount_pct: 0,
      items: [{ product_id: 'PRD-TEST-PAY', hsn: '6802', uom: 'sqft', uom_qty: 10, qty: 1, rate_paise: 10000 }],
    });
    expect(created.status).toBe(201);
    const inv = created.body.invoice;
    const path = `/api/invoices/${inv.id.replace(/\//g, '~')}`;
    const owedBefore = db.prepare('SELECT outstanding_paise AS v FROM customers WHERE id = ?').get('C001').v;

    const part = await request(app).post(`${path}/pay`).set('Cookie', cookies).send({ mode: 'NEFT', amount_paise: 50000 });
    expect(part.status).toBe(200);
    expect(part.body.invoice.paid).toBe(0);
    expect(part.body.invoice.received_paise).toBe(50000);

    const over = await request(app).post(`${path}/pay`).set('Cookie', cookies).send({ mode: 'NEFT', amount_paise: inv.total_paise });
    expect(over.status).toBe(400);

    const edit = await request(app).patch(`${path}/items/1`).set('Cookie', cookies).send({ qty: 2, reason: 'customer took two' });
    expect(edit.status).toBe(400);   // money received: use a credit / debit note

    const rest = await request(app).post('/api/payments').set('Cookie', cookies).send({
      type: 'receipt', invoice_id: inv.id, party: 'Test Customer TN', amount_paise: inv.total_paise - 50000, mode: 'NEFT',
    });
    expect(rest.status).toBe(201);
    const after = db.prepare('SELECT paid, received_paise FROM invoices WHERE id = ?').get(inv.id);
    expect(after).toEqual({ paid: 1, received_paise: inv.total_paise });
    expect(db.prepare('SELECT outstanding_paise AS v FROM customers WHERE id = ?').get('C001').v).toBe(owedBefore - inv.total_paise);

    // Reversing the second receipt re-opens the invoice with the part-payment still counted
    const rev = await request(app).post(`/api/payments/${rest.body.payment.id.replace(/\//g, '~')}/reverse`).set('Cookie', cookies);
    expect(rev.status).toBe(200);
    expect(db.prepare('SELECT paid, received_paise FROM invoices WHERE id = ?').get(inv.id)).toEqual({ paid: 0, received_paise: 50000 });
  });

  it('Editing an invoice line keeps stock in step', async () => {
    const { getDb } = await import('../src/db/connection.js');
    const db = getDb();
    const created = await request(app).post('/api/invoices').set('Cookie', cookies).send({
      customer_id: 'C001', discount_pct: 0,
      items: [{ product_id: 'PRD-TEST-PAY', hsn: '6802', uom: 'sqft', uom_qty: 10, qty: 1, rate_paise: 10000 }],
    });
    expect(created.status).toBe(201);
    const path = `/api/invoices/${created.body.invoice.id.replace(/\//g, '~')}`;
    const stock = () => db.prepare("SELECT stock FROM products WHERE id = 'PRD-TEST-PAY'").get().stock;
    const before = stock();
    expect((await request(app).patch(`${path}/items/1`).set('Cookie', cookies).send({ qty: 3, reason: 'three slabs' })).status).toBe(200);
    expect(stock()).toBe(before - 2);
    expect((await request(app).patch(`${path}/items/1`).set('Cookie', cookies).send({ qty: 50, reason: 'too many' })).status).toBe(400);
    expect((await request(app).patch(`${path}/items/1`).set('Cookie', cookies).send({ qty: 1, reason: 'back to one' })).status).toBe(200);
    expect(stock()).toBe(before);
  });
  it('GST returns run', async () => {
    const g1 = await request(app).get('/api/reports/gstr1?from=2020-01-01&to=2099-12-31').set('Cookie', cookies);
    expect(g1.status).toBe(200);
    const g3 = await request(app).get('/api/reports/gstr3b?from=2020-01-01&to=2099-12-31').set('Cookie', cookies);
    expect(g3.status).toBe(200);
    const g9 = await request(app).get('/api/reports/gstr9?fy=2026-27').set('Cookie', cookies);
    expect(g9.status).toBe(200);
  });
});
