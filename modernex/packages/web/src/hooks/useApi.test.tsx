// ══════════════════════════════════════════════════════
// React Query Hooks Tests (Simplified)
// ══════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

// Note: Full hook testing requires React Query setup and mocked API responses.
// These tests verify that the hooks are exported and have the correct structure.

describe('useApi hooks', () => {
  it('should export useProducts hook', async () => {
    const { useProducts } = await import('./useApi');
    expect(useProducts).toBeDefined();
    expect(typeof useProducts).toBe('function');
  });

  it('should export useCustomers hook', async () => {
    const { useCustomers } = await import('./useApi');
    expect(useCustomers).toBeDefined();
    expect(typeof useCustomers).toBe('function');
  });

  it('should export useInvoices hook', async () => {
    const { useInvoices } = await import('./useApi');
    expect(useInvoices).toBeDefined();
    expect(typeof useInvoices).toBe('function');
  });

  it('should export mutation hooks', async () => {
    const { useCreateProduct, useUpdateProduct, useDeleteProduct } = await import('./useApi');
    expect(useCreateProduct).toBeDefined();
    expect(useUpdateProduct).toBeDefined();
    expect(useDeleteProduct).toBeDefined();
  });
});
