// ══════════════════════════════════════════════════════
// React Query Hooks for Data Fetching
// ══════════════════════════════════════════════════════

import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type {
  Product,
  Customer,
  Vendor,
  Invoice,
  Payment,
  ProductionJob,
  PurchaseOrder,
  CollectionAccount,
  Location,
  User,
  ProductTraceResponse,
  CompanyDetails,
} from '@/types';

// ─── Query Keys ───
export const queryKeys = {
  products: {
    all: ['products'] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) => ['products', 'list', filters] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) => ['customers', 'list', filters] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  vendors: {
    all: ['vendors'] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) => ['vendors', 'list', filters] as const,
    detail: (id: string) => ['vendors', 'detail', id] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) => ['invoices', 'list', filters] as const,
    detail: (id: string) => ['invoices', 'detail', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) => ['payments', 'list', filters] as const,
  },
  production: {
    all: ['production'] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) => ['production', 'list', filters] as const,
    detail: (id: string) => ['production', 'detail', id] as const,
  },
  purchase: {
    all: ['purchase'] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) => ['purchase', 'list', filters] as const,
    detail: (id: string) => ['purchase', 'detail', id] as const,
  },
  users: {
    all: ['users'] as const,
    list: () => ['users', 'list'] as const,
    detail: (id: number) => ['users', 'detail', id] as const,
  },
  accounts: {
    all: ['accounts'] as const,
    list: () => ['accounts', 'list'] as const,
  },
  reports: {
    sales: (params?: Record<string, unknown>) => ['reports', 'sales', params] as const,
    inventory: () => ['reports', 'inventory'] as const,
    gst: (params?: Record<string, unknown>) => ['reports', 'gst', params] as const,
  },
  locations: {
    all: ['locations'] as const,
    list: () => ['locations', 'list'] as const,
  },
  company: {
    detail: () => ['company'] as const,
  },
};

// ─── Products ───
export function useProducts(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: () => api.get<{ products: Product[] }>('/products', { params: filters }),
  });
}

export function useProduct(id: string, options?: Omit<UseQueryOptions<Product>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => api.get<{ product: Product }>(`/products/${id}`).then((res) => res.product),
    ...options,
  });
}

export function useProductTrace(id: string, options?: Omit<UseQueryOptions<ProductTraceResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: ['products', 'trace', id],
    queryFn: () => api.get<ProductTraceResponse>(`/products/${id}/trace`),
    ...options,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: queryKeys.locations.list(),
    queryFn: () => api.get<{ locations: Location[] }>('/locations').then((res) => res.locations),
  });
}

export function useMoveProduct(options?: UseMutationOptions<Product, Error, { id: string; data: Record<string, unknown> }>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.post<{ product: Product }>(`/products/${id}/move`, data).then((res) => res.product),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: ['products', 'trace', variables.id] });
    },
    ...options,
  });
}

export function useCreateProduct(options?: UseMutationOptions<Product, Error, Partial<Product>>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Partial<Product>) => api.post<Product>('/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    ...options,
  });
}

export function useUpdateProduct(options?: UseMutationOptions<Product, Error, { id: string; data: Partial<Product> }>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      api.patch<{ product: Product }>(`/products/${id}`, data).then((res) => res.product),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(variables.id) });
    },
    ...options,
  });
}

export function useDeleteProduct(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    ...options,
  });
}

// ─── Customers ───
export function useCustomers(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: queryKeys.customers.list(filters),
    queryFn: () => api.get<{ customers: Customer[] }>('/customers', { params: filters }),
  });
}

export function useCustomer(id: string, options?: Omit<UseQueryOptions<Customer>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => api.get<Customer>(`/customers/${id}`),
    ...options,
  });
}

export function useCreateCustomer(options?: UseMutationOptions<Customer, Error, Partial<Customer>>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Partial<Customer>) => api.post<Customer>('/customers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    ...options,
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Customer>) => api.patch<{ customer: Customer }>(`/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}

// ─── Invoices ───
export function useInvoices(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: queryKeys.invoices.list(filters),
    queryFn: () => api.get<{ invoices: Invoice[] }>('/invoices', { params: filters }),
  });
}

export function useInvoice(id: string, options?: Omit<UseQueryOptions<Invoice>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: () => api.get<{ invoice: Invoice }>(`/invoices/${encodeURIComponent(id)}`).then((res) => res.invoice),
    ...options,
  });
}

export function useCreateInvoice(options?: UseMutationOptions<Invoice, Error, Partial<Invoice>>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Partial<Invoice>) => api.post<{ invoice: Invoice }>('/invoices', data).then((res) => res.invoice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: ['reports'] }); // balance sheet, sales, GST
    },
    ...options,
  });
}

// ─── Vendors ───
export function useVendors(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: queryKeys.vendors.list(filters),
    queryFn: () => api.get<{ vendors: Vendor[] }>('/vendors', { params: filters }),
  });
}

// ─── Users ───
export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => api.get<{ users: User[] }>('/users'),
  });
}

export function useCreateUser(options?: UseMutationOptions<User, Error, Partial<User>>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User>) => api.post<User>('/users', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); },
    ...options,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<User>) =>
      api.patch<{ user: User }>(`/users/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: boolean }>(`/users/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, must_change = true }: { id: number; must_change?: boolean }) =>
      api.post<{ ok: boolean; generated_password?: string }>(`/users/${id}/reset-password`, { must_change }),
  });
}

export function useUnlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<{ ok: boolean }>(`/users/${id}/unlock`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); },
  });
}

// ─── Collection Accounts ───
export function useCollectionAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: () => api.get<{ accounts: CollectionAccount[] }>('/collection-accounts'),
  });
}

export function useCreateCollectionAccount(options?: UseMutationOptions<CollectionAccount, Error, Partial<CollectionAccount>>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Partial<CollectionAccount>) => api.post<{ account: CollectionAccount }>('/collection-accounts', data).then(res => res.account),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
    ...options,
  });
}

export function useUpdateCollectionAccount(options?: UseMutationOptions<CollectionAccount, Error, { id: string; data: Partial<CollectionAccount> }>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CollectionAccount> }) => 
      api.patch<{ account: CollectionAccount }>(`/collection-accounts/${id}`, data).then(res => res.account),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
    ...options,
  });
}

// ─── Production Jobs ───
export function useProductionJobs(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: queryKeys.production.list(filters),
    queryFn: () => api.get<{ jobs: ProductionJob[] }>('/production', { params: filters }),
  });
}

export function useProductionJob(id: string, options?: Omit<UseQueryOptions<ProductionJob>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.production.detail(id),
    queryFn: () => api.get<{ job: ProductionJob }>(`/production/${id}`).then((res) => res.job),
    ...options,
  });
}

export function useCreateProductionJob(options?: UseMutationOptions<{ job: ProductionJob; created_products: string[] }, Error, any>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => api.post<{ job: ProductionJob; created_products: string[] }>('/production', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.production.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    ...options,
  });
}

export function useUpdateProductionJob(options?: UseMutationOptions<ProductionJob, Error, { id: string; data: Partial<ProductionJob> }>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductionJob> }) =>
      api.patch<{ job: ProductionJob }>(`/production/${id}`, data).then((res) => res.job),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.production.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.production.detail(variables.id) });
    },
    ...options,
  });
}

// ─── Create Vendor ───
export function useCreateVendor(options?: UseMutationOptions<{ vendor: Vendor }, Error, Partial<Vendor>>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Vendor>) => api.post<{ vendor: Vendor }>('/vendors', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all });
    },
    ...options,
  });
}

// ─── Update Vendor ───
export function useUpdateVendor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Vendor>) => api.patch<{ vendor: Vendor }>(`/vendors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all });
    },
  });
}

// ─── Purchase Orders ───
export function usePurchaseOrders(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: queryKeys.purchase.list(filters),
    queryFn: () => api.get<{ purchase_orders: PurchaseOrder[] }>('/purchase', { params: filters }),
  });
}

export function usePurchaseOrder(id: string, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.purchase.detail(id),
    queryFn: () => api.get<{ po: any }>(`/purchase/${encodeURIComponent(id)}`),
    enabled: !!id,
    ...options,
  });
}

export function useCreatePurchaseOrder(options?: UseMutationOptions<{ po: PurchaseOrder }, Error, any>) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => api.post<{ po: PurchaseOrder }>('/purchase', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchase.all });
    },
    ...options,
  });
}

// ─── Company Details ───
export function useCompany() {
  return useQuery({
    queryKey: queryKeys.company.detail(),
    queryFn: () => api.get<{ company: CompanyDetails }>('/company'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateCompany(options?: UseMutationOptions<{ company: CompanyDetails }, Error, Partial<CompanyDetails>>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CompanyDetails>) => api.put<{ company: CompanyDetails }>('/company', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.detail() });
    },
    ...options,
  });
}

// ─── Payments ───
export function usePayments(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: queryKeys.payments.list(filters),
    queryFn: () => api.get<{ payments: Payment[] }>('/payments', { params: filters }),
  });
}

export function useCreatePayment(options?: UseMutationOptions<{ payment: Payment }, Error, any>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post<{ payment: Payment }>('/payments', data),
    ...options,
    onSuccess: (...args) => {
      const variables = args[1];
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all }); // invoice balance updates
      queryClient.invalidateQueries({ queryKey: ['reports'] }); // balance sheet, sales, GST
      if (variables?.po_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.purchase.detail(variables.po_id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.purchase.all });
      }
      (options?.onSuccess as any)?.(...args);
    },
  });
}

// ─── Variety Master ───
export function useVarietyMaster(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: ['variety-master', 'list', filters],
    queryFn: () => api.get<{ varieties: any[] }>('/variety-master', { params: filters }),
    staleTime: 10 * 60 * 1000,
  });
}
export function useCreateVariety() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post<{ variety: any }>('/variety-master', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['variety-master'] }),
  });
}
export function useUpdateVariety(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.patch<{ variety: any }>(`/variety-master/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['variety-master'] }),
  });
}
export function useDeleteVariety() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/variety-master/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['variety-master'] }),
  });
}

/** Update any variety by ID — used for photo uploads and inline edits */
export function useUpdateVarietyById() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.patch<{ variety: any }>(`/variety-master/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['variety-master'] }),
  });
}

// ─── Debit / Credit Notes ───
export function useDebitCreditNotes(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: ['dcn', 'list', filters],
    queryFn: () => api.get<{ notes: any[] }>('/dcn', { params: filters }),
  });
}
export function useCreateDCN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post<{ note: any }>('/dcn', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dcn'] }),
  });
}
export function useConfirmDCN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<{ note: any }>(`/dcn/${id}/confirm`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dcn'] }),
  });
}
export function useCancelDCN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<{ note: any }>(`/dcn/${id}/cancel`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dcn'] }),
  });
}

// ─── GRN (Goods Receipt Notes) ───
export function useGRNList(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: ['grn', 'list', filters],
    queryFn: () => api.get<{ receipts: any[] }>('/grn', { params: filters }),
  });
}
export function useCreateGRN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post<{ receipt: any }>('/grn', data),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['grn'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchase.detail(v.po_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchase.all });
    },
  });
}
export function useUpdatePOTransport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.patch<{ po: any }>(`/purchase/${id}/transport`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchase.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchase.all });
    },
  });
}

// ─── Reports ───
export function useDashboard() {
  return useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => api.get<any>('/reports/dashboard'),
    staleTime: 2 * 60 * 1000,
  });
}
export function usePnL(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'pnl', params],
    queryFn: () => api.get<any>('/reports/pnl', { params }),
  });
}
export function useGSTR1(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'gstr1', params],
    queryFn: () => api.get<any>('/reports/gstr1', { params }),
  });
}
export function useGSTR3B(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'gstr3b', params],
    queryFn: () => api.get<any>('/reports/gstr3b', { params }),
  });
}
export function useGSTR9(fy?: string) {
  return useQuery({
    queryKey: ['reports', 'gstr9', fy],
    queryFn: () => api.get<any>('/reports/gstr9', { params: { fy } }),
    enabled: !!fy,
  });
}
export function useDayBook(params?: { from?: string; to?: string; limit?: number }) {
  return useQuery({
    queryKey: ['reports', 'day-book', params],
    queryFn: () => api.get<any>('/reports/day-book', { params }),
  });
}
export function useSalesRegister(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'sales-register', params],
    queryFn: () => api.get<any>('/reports/sales-register', { params }),
  });
}
export function usePurchaseRegister(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'purchase-register', params],
    queryFn: () => api.get<any>('/reports/purchase-register', { params }),
  });
}
export function useFilingCalendar(fy?: string) {
  return useQuery({
    queryKey: ['reports', 'filing-calendar', fy],
    queryFn: () => api.get<any>('/reports/filing-calendar', { params: { fy } }),
    staleTime: 5 * 60 * 1000,
  });
}
export function useUpdateFilingPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.patch<any>(`/reports/filing-calendar/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports', 'filing-calendar'] }),
  });
}
export function useCustomerLedger(customerId: string) {
  return useQuery({
    queryKey: ['reports', 'customer-ledger', customerId],
    queryFn: () => api.get<any>(`/reports/customer-ledger/${customerId}`),
    enabled: !!customerId,
  });
}
export function useVendorLedger(vendorId: string) {
  return useQuery({
    queryKey: ['reports', 'vendor-ledger', vendorId],
    queryFn: () => api.get<any>(`/reports/vendor-ledger/${vendorId}`),
    enabled: !!vendorId,
  });
}
export function useAgingReport() {
  return useQuery({
    queryKey: ['reports', 'aging'],
    queryFn: () => api.get<any>('/reports/aging'),
  });
}

// ─── TDS ─────────────────────────────────────────────────────────────────────
export function useTdsSections() {
  return useQuery({ queryKey: ['tds', 'sections'], queryFn: () => api.get<any>('/tds/sections') });
}
export function useTdsTransactions(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['tds', 'list', filters], queryFn: () => api.get<any>('/tds', { params: filters }) });
}
export function useCreateTds() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/tds', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['tds'] }) });
}
export function useDepositTds(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.patch<any>(`/tds/${id}/deposit`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['tds'] }) });
}
export function useTdsChallans(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['tds', 'challans', filters], queryFn: () => api.get<any>('/tds/challans', { params: filters }) });
}
export function useCreateTdsChallan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/tds/challans', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['tds', 'challans'] }) });
}
export function useTds26Q(fy?: string, quarter?: string) {
  return useQuery({ queryKey: ['tds', '26q', fy, quarter], queryFn: () => api.get<any>('/tds/26q', { params: { fy, quarter } }), enabled: !!fy && !!quarter });
}

// ─── FIXED ASSETS ─────────────────────────────────────────────────────────────
export function useFixedAssets(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['fixed-assets', 'list', filters], queryFn: () => api.get<any>('/fixed-assets', { params: filters }) });
}
export function useFixedAsset(id: string) {
  return useQuery({ queryKey: ['fixed-assets', 'detail', id], queryFn: () => api.get<any>(`/fixed-assets/${id}`), enabled: !!id });
}
export function useCreateFixedAsset() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/fixed-assets', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-assets'] }) });
}
export function useUpdateFixedAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.patch<any>(`/fixed-assets/${id}`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-assets'] }) });
}
export function useDisposeAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>(`/fixed-assets/${id}/dispose`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-assets'] }) });
}
export function useRunDepreciation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/fixed-assets/depreciation/run', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-assets'] }) });
}

// ─── PAYROLL ──────────────────────────────────────────────────────────────────
export function useEmployees(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['payroll', 'employees', filters], queryFn: () => api.get<any>('/payroll/employees', { params: filters }) });
}
export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/payroll/employees', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'employees'] }) });
}
export function useUpdateEmployee(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.patch<any>(`/payroll/employees/${id}`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'employees'] }) });
}
export function usePayrollRuns() {
  return useQuery({ queryKey: ['payroll', 'runs'], queryFn: () => api.get<any>('/payroll/runs') });
}
export function usePayrollRun(id: string) {
  return useQuery({ queryKey: ['payroll', 'run', id], queryFn: () => api.get<any>(`/payroll/runs/${id}`), enabled: !!id });
}
export function useProcessPayroll() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/payroll/runs', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }) });
}
export function useMarkPayrollPaid(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.patch<any>(`/payroll/runs/${id}/mark-paid`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }) });
}

// ─── PDC ──────────────────────────────────────────────────────────────────────
export function usePDCs(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['pdc', 'list', filters], queryFn: () => api.get<any>('/pdc', { params: filters }) });
}
export function usePDCsDueToday() {
  return useQuery({ queryKey: ['pdc', 'due-today'], queryFn: () => api.get<any>('/pdc/due-today') });
}
export function useCreatePDC() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/pdc', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['pdc'] }) });
}
export function useUpdatePDCStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.patch<any>(`/pdc/${id}/status`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['pdc'] }) });
}

// ─── CHART OF ACCOUNTS ────────────────────────────────────────────────────────
export function useAccountGroups() {
  return useQuery({ queryKey: ['coa', 'groups'], queryFn: () => api.get<any>('/coa/groups') });
}
export function useAccounts(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['coa', 'accounts', filters], queryFn: () => api.get<any>('/coa/accounts', { params: filters }) });
}
export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/coa/accounts', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['coa'] }) });
}
export function useUpdateAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.patch<any>(`/coa/accounts/${id}`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['coa'] }) });
}
export function useJournalVouchers(filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['coa', 'vouchers', filters], queryFn: () => api.get<any>('/coa/vouchers', { params: filters }) });
}
export function useJournalVoucher(id: string) {
  return useQuery({ queryKey: ['coa', 'voucher', id], queryFn: () => api.get<any>(`/coa/vouchers/${id}`), enabled: !!id });
}
export function useCreateJournalVoucher() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/coa/vouchers', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['coa'] }) });
}

// ─── BANK RECONCILIATION ─────────────────────────────────────────────────────
export function useBankAccounts() {
  return useQuery({ queryKey: ['bank-recon', 'accounts'], queryFn: () => api.get<any>('/bank-recon/accounts') });
}
export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/bank-recon/accounts', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-recon'] }) });
}
export function useBankStatement(bankId: string, filters?: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['bank-recon', 'statement', bankId, filters], queryFn: () => api.get<any>(`/bank-recon/${bankId}/statement`, { params: filters }), enabled: !!bankId });
}
export function useImportBankStatement(bankId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>(`/bank-recon/${bankId}/import`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-recon'] }) });
}
export function useReconcileLine() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ lineId, payment_id }: { lineId: number; payment_id: string }) => api.patch<any>(`/bank-recon/lines/${lineId}/reconcile`, { matched_payment_id: payment_id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-recon'] }) });
}
export function useBRS(bankId: string, asOf?: string) {
  return useQuery({ queryKey: ['bank-recon', 'brs', bankId, asOf], queryFn: () => api.get<any>(`/bank-recon/${bankId}/brs`, { params: { as_of: asOf } }), enabled: !!bankId });
}

// ─── ADVANCED REPORTS ─────────────────────────────────────────────────────────
export function useMSMECompliance() {
  return useQuery({ queryKey: ['reports', 'msme'], queryFn: () => api.get<any>('/reports/msme-compliance') });
}
export function useOverdueInterest(asOf?: string) {
  return useQuery({ queryKey: ['reports', 'overdue-interest', asOf], queryFn: () => api.get<any>('/reports/overdue-interest', { params: { as_of: asOf } }) });
}
export function useTrialBalance() {
  return useQuery({ queryKey: ['reports', 'trial-balance'], queryFn: () => api.get<any>('/reports/trial-balance') });
}
export function useBalanceSheet() {
  return useQuery({ queryKey: ['reports', 'balance-sheet'], queryFn: () => api.get<any>('/reports/balance-sheet') });
}
export function useGSTR2BRecon(period?: string) {
  return useQuery({ queryKey: ['reports', 'gstr2b', period], queryFn: () => api.get<any>('/reports/gstr2b-recon', { params: { period } }), enabled: !!period });
}
export function useImportGSTR2B() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => api.post<any>('/reports/gstr2b-import', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', 'gstr2b'] }) });
}
