// ══════════════════════════════════════════════════════
// Modern State Management with Zustand
// ══════════════════════════════════════════════════════

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { User, Theme, Toast, ToastType } from '@/types';
import { api } from '@/utils/api';

// ─── Auth Store ───
interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      user: null,
      loading: true,
      error: null,

      login: async (username: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.post<{ user: User }>('/auth/login', { username, password });
          const user = response.user;
          set({ user, loading: false });
          return user;
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Login failed';
          set({ error, loading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // Ignore logout errors
        }
        set({ user: null, error: null });
      },

      checkAuth: async () => {
        set({ loading: true });
        try {
          const response = await api.get<{ user: User }>('/auth/me');
          set({ user: response.user, loading: false });
        } catch {
          set({ user: null, loading: false });
        }
      },

      updateUser: (user: User) => {
        set({ user });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'auth-store' }
  )
);

// ─── Theme Store ───
interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const getInitialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem('modernex-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage disabled
  }
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: getInitialTheme(),
      
      toggle: () => {
        set((state) => {
          const newTheme = state.theme === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', newTheme);
          return { theme: newTheme };
        });
      },
      
      setTheme: (theme: Theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
    }),
    {
      name: 'modernex-theme',
      onRehydrateStorage: () => (state) => {
        // Sync theme to DOM on hydration
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);

// ─── Toast Store ───
interface ToastState {
  toasts: Toast[];
  notify: (message: string, type?: ToastType, duration?: number) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

let toastId = 0;

export const useToastStore = create<ToastState>()(
  devtools(
    (set) => ({
      toasts: [],
      
      notify: (message: string, type: ToastType = 'info', duration = 5000) => {
        const id = `toast-${++toastId}`;
        const toast: Toast = { id, message, type, duration };
        
        set((state) => ({
          toasts: [...state.toasts, toast],
        }));
        
        if (duration > 0) {
          setTimeout(() => {
            set((state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }));
          }, duration);
        }
      },
      
      dismiss: (id: string) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },
      
      dismissAll: () => {
        set({ toasts: [] });
      },
    }),
    { name: 'toast-store' }
  )
);

// ─── App Store (Global UI State) ───
interface AppState {
  sidebarCollapsed: boolean;
  loading: boolean;
  
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        loading: false,
        
        toggleSidebar: () => {
          set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
        },
        
        setSidebarCollapsed: (collapsed: boolean) => {
          set({ sidebarCollapsed: collapsed });
        },
        
        setLoading: (loading: boolean) => {
          set({ loading });
        },
      }),
      {
        name: 'modernex-app',
        partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
      }
    ),
    { name: 'app-store' }
  )
);

// ─── Cart Store ───
export interface CartProduct {
  id: string;
  variety: string;
  kind: string;
  hsn: string;
  uom: string;
  rate_paise: number;
  unit_cost_paise?: number;
  stock: number;
  lot_id?: string;
  grade?: string;
  dimensions?: {
    size_lw?: string;
    thickness_mm?: number;
    sqft?: number;
    cft?: number;
  };
}

export interface CartItem {
  product: CartProduct;
  quantity: number;
  ratePaise: number;
}

interface CartState {
  items: CartItem[];
  customerId: string;
  cartOpen: boolean;
  addItem: (product: CartProduct) => 'added' | 'updated' | 'max_stock';
  removeItem: (productId: string) => void;
  adjustQuantity: (productId: string, delta: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setRate: (productId: string, rateRupees: number) => void;
  setCustomerId: (id: string) => void;
  clearCart: () => void;
  toggleCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerId: '',
      cartOpen: true,

      addItem: (product) => {
        const { items } = get();
        const existing = items.find((i) => i.product.id === product.id);
        const maxStock = product.stock ?? 0;
        if (existing) {
          const nextQty = existing.quantity + 1;
          if (nextQty > maxStock) return 'max_stock';
          set({ items: items.map((i) => i.product.id === product.id ? { ...i, quantity: nextQty } : i) });
          return 'updated';
        }
        if (maxStock < 1) return 'max_stock';
        set({ items: [...items, { product, quantity: 1, ratePaise: product.rate_paise ?? product.unit_cost_paise ?? 0 }] });
        return 'added';
      },

      removeItem: (productId) => set({ items: get().items.filter((i) => i.product.id !== productId) }),

      adjustQuantity: (productId, delta) => {
        set({
          items: get().items.map((i) => {
            if (i.product.id !== productId) return i;
            return { ...i, quantity: Math.max(1, Math.min(i.product.stock ?? 99, i.quantity + delta)) };
          }),
        });
      },

      setQuantity: (productId, quantity) => {
        set({
          items: get().items.map((i) => {
            if (i.product.id !== productId) return i;
            const q = Number.isFinite(quantity) ? Math.floor(quantity) : 1;
            return { ...i, quantity: Math.max(1, Math.min(i.product.stock ?? 99, q)) };
          }),
        });
      },

      setRate: (productId, rateRupees) => {
        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, ratePaise: Math.round(rateRupees * 100) } : i
          ),
        });
      },

      setCustomerId: (id) => set({ customerId: id }),
      clearCart: () => set({ items: [] }),
      toggleCart: () => set((s) => ({ cartOpen: !s.cartOpen })),
    }),
    { name: 'modernex-cart' }
  )
);

// ─── Inventory Filter Store ───
interface InventoryFilterState {
  variety: string[];
  grade: string[];
  status: string[];
  kind: string[];
  search: string;
  
  setVariety: (variety: string[]) => void;
  setGrade: (grade: string[]) => void;
  setStatus: (status: string[]) => void;
  setKind: (kind: string[]) => void;
  setSearch: (search: string) => void;
  reset: () => void;
}

const initialFilterState = {
  variety: [],
  grade: [],
  status: [],
  kind: [],
  search: '',
};

export const useInventoryFilterStore = create<InventoryFilterState>()(
  devtools(
    (set) => ({
      ...initialFilterState,
      
      setVariety: (variety) => set({ variety }),
      setGrade: (grade) => set({ grade }),
      setStatus: (status) => set({ status }),
      setKind: (kind) => set({ kind }),
      setSearch: (search) => set({ search }),
      reset: () => set(initialFilterState),
    }),
    { name: 'inventory-filter-store' }
  )
);
