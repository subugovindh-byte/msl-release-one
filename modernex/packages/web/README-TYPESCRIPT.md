# Modernex Web — TypeScript + Modern React

Modern React frontend with TypeScript, Zustand state management, and React Query data fetching.

## 🚀 Tech Stack

- **React 18** — Latest React with concurrent features
- **TypeScript 5.4** — Full type safety
- **Zustand** — Lightweight state management
- **React Query (TanStack Query)** — Powerful data fetching
- **React Router 6** — Client-side routing
- **Vite** — Fast build tool with HMR

## 📁 Project Structure

```
src/
├── components/      # Reusable UI components
│   ├── Shared.tsx         # Button, Input, Card, etc.
│   └── ToastContainer.tsx # Toast notifications
├── hooks/           # Custom React hooks
│   └── useApi.ts          # React Query hooks
├── pages/           # Route pages
│   ├── LoginPage.tsx
│   ├── POSPage.tsx
│   └── ...
├── store/           # Zustand stores
│   └── index.ts           # Auth, theme, toast, app stores
├── types/           # TypeScript definitions
│   └── index.ts
├── utils/           # Utility functions
│   ├── api.ts             # API client
│   └── format.ts          # Formatting helpers
├── styles/          # Global CSS
├── App.tsx          # Main app component
└── main.tsx         # Entry point
```

## 🎯 Key Features

### Modern State Management with Zustand

```typescript
// Use stores anywhere in your components
import { useAuthStore, useThemeStore, useToastStore } from '@/store';

function MyComponent() {
  const { user, login, logout } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const { notify } = useToastStore();
  
  // ...
}
```

**Available stores:**
- `useAuthStore` — User authentication
- `useThemeStore` — Dark/light theme (persisted)
- `useToastStore` — Toast notifications
- `useAppStore` — Global UI state
- `useInventoryFilterStore` — Inventory filters

### Data Fetching with React Query

```typescript
import { useProducts, useCreateProduct } from '@/hooks/useApi';

function ProductList() {
  const { data, isLoading, error } = useProducts({ status: 'available' });
  const createProduct = useCreateProduct();
  
  // Automatic caching, refetching, and optimistic updates
}
```

**Available hooks:**
- `useProducts`, `useProduct`, `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`
- `useCustomers`, `useCustomer`, `useCreateCustomer`
- `useInvoices`, `useInvoice`, `useCreateInvoice`
- `useVendors`, `useUsers`, `useCollectionAccounts`

### Type-Safe API Client

```typescript
import { api } from '@/utils/api';

// Fully typed API calls
const products = await api.get<Product[]>('/products', {
  params: { variety: 'Black Galaxy', status: 'available' }
});

const newCustomer = await api.post<Customer>('/customers', {
  name: 'ABC Stones',
  gstin: '33AABFM1234A1Z7',
  state: 'Tamil Nadu'
});
```

### Shared UI Components

```typescript
import { Button, Input, Select, Card, Badge, Spinner } from '@/components/Shared';

<Card title="Customer Details">
  <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
  <Select label="State" options={stateOptions} value={state} />
  <Button variant="primary" loading={submitting}>Save</Button>
</Card>
```

### Utility Functions

```typescript
import { formatCurrency, formatDate, isValidGSTIN } from '@/utils/format';

formatCurrency(125000);           // ₹1,250.00
formatDate(new Date());           // 28 Apr 2026
isValidGSTIN('33AABFM1234A1Z7'); // true
```

## 🛠 Development

```bash
# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Type check
npm run type-check

# Lint
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📝 Adding New Features

### 1. Create a New Page

```typescript
// src/pages/NewPage.tsx
import React from 'react';

export function NewPage() {
  return (
    <div className="page">
      <h1>New Feature</h1>
    </div>
  );
}
```

### 2. Add Route

```typescript
// src/App.tsx
import { NewPage } from '@/pages/NewPage';

<Route path="/new-feature" element={<NewPage />} />
```

### 3. Add to Navigation

```typescript
// src/App.tsx
const NAV = [
  // ...
  { id: 'new-feature', path: '/new-feature', lbl: 'New Feature', icon: '[N]' },
];
```

### 4. Create API Hook (if needed)

```typescript
// src/hooks/useApi.ts
export function useNewFeatureData() {
  return useQuery({
    queryKey: ['new-feature'],
    queryFn: () => api.get<FeatureData>('/new-feature'),
  });
}
```

## 🎨 Styling

Uses existing CSS custom properties for theming:

```css
/* Dark theme (default) */
--bg1: #1a1a1a;
--bg2: #242424;
--t1: #ffffff;
--t2: #d0d0d0;
--t3: #999999;
--accent: #d4522a;

/* Light theme */
--bg1: #ffffff;
--bg2: #f5f5f5;
--t1: #1a1a1a;
--t2: #4a4a4a;
--t3: #6b6b6b;
--accent: #d4522a;
```

## 🔒 Type Safety

All API responses, component props, and state are fully typed:

```typescript
// Compile-time type checking
const user: User = useAuthStore().user;
const products: Product[] = useProducts().data?.data || [];

// TypeScript will catch errors
user.invalidProperty; // ❌ Error: Property 'invalidProperty' does not exist
```

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

## 📦 Build Output

Production build creates optimized bundles:
- Vendor chunk (React, React DOM, React Router)
- Query chunk (React Query)
- Zustand chunk (state management)
- App chunk (application code)

Configured code splitting ensures optimal load times.

## 🚢 Deployment

The production build outputs to `dist/` which is served by the Node.js backend in production mode.

```bash
npm run build
# Output: dist/index.html, dist/assets/...
```

## 📚 Learn More

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Query Docs](https://tanstack.com/query/latest)
- [Zustand Guide](https://docs.pmnd.rs/zustand/)
- [React Router](https://reactrouter.com/)
- [Vite Guide](https://vitejs.dev/guide/)
