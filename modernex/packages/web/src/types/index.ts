// ══════════════════════════════════════════════════════
// TypeScript Type Definitions for Modernex Stones
// ══════════════════════════════════════════════════════


// ─── User & Auth ───
export type UserRole = 'admin' | 'accounts' | 'yard' | 'sales' | string;

export interface Permission {
  id: number;
  resource: string;
  action: string;
  description?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  is_system: number;
  created_at?: string;
  created_by?: string;
  permissions?: Permission[];
}

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  roles?: Role[];
  active: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
}

// ─── Product Types ───
export type ProductKind = 
  | 'block' 
  | 'slab' 
  | 'tile' 
  | 'cts' 
  | 'strip' 
  | 'kerb' 
  | 'cobble' 
  | 'chips' 
  | 'dust' 
  | 'monument';

export type Variety = 
  | 'Black Galaxy'
  | 'Absolute Black'
  | 'Steel Grey'
  | 'Moon White'
  | 'Cat Eye'
  | 'Paradiso'
  | 'Tan Brown'
  | 'Surf Green'
  | 'Imperial Red'
  | 'Kashmir White'
  | 'Platinum Black'
  | 'Platinum White';

export type Grade = 'A+' | 'A' | 'B' | 'C';

export interface BaseProduct {
  id: string;
  kind: ProductKind;
  variety: Variety;
  grade?: Grade;
  status: 'available' | 'sold' | 'reserved' | 'damaged';
  location: string;
  costPaise: number;
  rate_paise?: number;
  hsn?: string;
  uom?: string;
  lot_id?: string;
  stock?: number;
  notes?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlabProduct extends BaseProduct {
  kind: 'slab';
  sizeLw: string;          // "2600×1600"
  thicknessMm: number;
  sqft: number;
  grade: Grade;
}

export interface BlockProduct extends BaseProduct {
  kind: 'block';
  lengthM: number;
  widthM: number;
  heightM: number;
  sourceQuarry?: string;
}

export type Product = SlabProduct | BlockProduct | BaseProduct;

// ─── Company Details ───
export interface CompanyDetails {
  id: number;
  name: string;
  trade_name?: string;
  gstin: string;
  pan: string;
  hsn: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone?: string;
  email?: string;
  fy: string;
  updated_at: string;
  updated_by?: string;
}

// ─── Customer & Vendor ───
export interface Customer {
  id: string;
  name: string;
  gstin?: string;
  state: string;
  address?: string;
  contact?: string;
  email?: string;
  creditDays: number;
  outstandingPaise: number;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  gstin?: string;
  state: string;
  contact?: string;
  type: 'Quarry' | 'Broker' | 'Transporter' | 'Other';
  msme: boolean;
  msme_number?: string;
  contact_person?: string;
  address?: string;
  pincode?: string;
  email?: string;
  po_count?: number;
  outstanding_paise?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Location {
  id: string;
  name: string;
  location_type: string;
  stage_hint?: string | null;
  is_active: number;
  sort_order: number;
}

export interface InventoryMove {
  id: number;
  product_id: string;
  qty: number;
  from_location_id?: string | null;
  to_location_id?: string | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  move_type: string;
  stage?: string | null;
  job_id?: string | null;
  notes?: string | null;
  scan_out_at?: string | null;
  scan_in_at?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface ProductTraceResponse {
  product: Product & {
    lot_id?: string;
    stock?: number;
    uom?: string;
    current_location_id?: string | null;
    current_location_name?: string | null;
    current_location_type?: string | null;
    dimensions?: Record<string, unknown>;
  };
  moves: InventoryMove[];
}

// ─── Invoice ───
export interface InvoiceItem {
  id?: number;
  productId: string;
  description: string;
  hsnCode: string;
  quantity: number;
  uom: string;
  ratePaise: number;
  discountPct: number;
  taxableAmountPaise: number;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  totalPaise: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  customerGstin?: string;
  customerState: string;
  customerAddress?: string;
  placeOfSupply: string;
  
  items: InvoiceItem[];
  
  subtotalPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
  
  paidAmountPaise: number;
  balancePaise: number;
  
  paymentTerms: string;
  notes?: string;
  
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  
  status: 'draft' | 'final' | 'cancelled';
  
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ─── Payment ───
export interface Payment {
  id: string;
  paymentDate: string;
  customerId?: string;
  vendorId?: string;
  amountPaise: number;
  mode: 'Cash' | 'Cheque' | 'NEFT' | 'RTGS' | 'UPI' | 'Card';
  referenceNo?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

// ─── Production ───
export type ProductionStage = 'Split' | 'Cut' | 'Polish';

export interface ProductionJob {
  id: string;
  jobNumber: string;
  jobDate: string;
  stage: ProductionStage;
  inputProductId: string;
  outputCount: number;
  labourCostPaise: number;
  powerCostPaise: number;
  consumablesCostPaise: number;
  totalCostPaise: number;
  status: 'in-progress' | 'completed' | 'cancelled';
  completedDate?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

// ─── Purchase Order ───
export interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string;
  vendorId: string;
  vendorName: string;
  items: InvoiceItem[];
  totalPaise: number;
  status: 'pending' | 'received' | 'cancelled';
  receivedDate?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

// ─── Reports ───
export interface SalesReport {
  period: string;
  totalSalesPaise: number;
  totalInvoices: number;
  topCustomers: Array<{
    name: string;
    salesPaise: number;
  }>;
  topVarieties: Array<{
    variety: Variety;
    quantity: number;
    salesPaise: number;
  }>;
}

export interface InventoryReport {
  totalValuePaise: number;
  byVariety: Record<Variety, {
    count: number;
    valuePaise: number;
  }>;
  byKind: Record<ProductKind, {
    count: number;
    valuePaise: number;
  }>;
  lowStock: Array<{
    variety: Variety;
    count: number;
    threshold: number;
  }>;
}

// ─── Collection Account (Bank/UPI) ───
export interface CollectionAccount {
  id: string;
  type: 'Bank' | 'UPI';
  accountName: string;
  account_name?: string;
  accountNumber?: string;
  account_number?: string;
  ifsc?: string;
  upiId?: string;
  upi_id?: string;
  upi_name?: string;
  account_holder?: string;
  qrCodeUrl?: string;
  qr_code_url?: string;
  is_default?: number | boolean;
  active: boolean;
  createdAt: string;
  created_at?: string;
}

// ─── API Response Types ───
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Form State ───
export interface FormState<T> {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  submitting: boolean;
  submitError?: string;
}

// ─── Table & Filter ───
export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
  width?: string;
}

export interface TableSort {
  key: string;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  variety?: Variety[];
  grade?: Grade[];
  status?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// ─── Theme ───
export type Theme = 'light' | 'dark';

export interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

// ─── Toast Notification ───
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface ToastState {
  toasts: Toast[];
  notify: (message: string, type?: ToastType, duration?: number) => void;
  dismiss: (id: string) => void;
}
