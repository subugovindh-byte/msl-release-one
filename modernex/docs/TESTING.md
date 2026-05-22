# Testing Guide

## 📦 Test Suite Overview

The Modernex project has comprehensive test coverage across:

- **Unit Tests**: Stores, utilities, API client, components
- **Integration Tests**: API endpoints
- **E2E Tests**: Full user workflows with Playwright

---

## 🧪 Test Stack

- **Vitest**: Fast unit test runner with native ESM support
- **Testing Library**: React component testing
- **Playwright**: End-to-end browser testing
- **Supertest**: API integration testing

---

## 📂 Test File Structure

```
packages/web/
├── src/
│   ├── components/
│   │   ├── Shared.test.tsx          # UI component tests
│   │   └── ToastContainer.test.tsx  # Toast notification tests
│   ├── pages/
│   │   └── LoginPage.test.tsx       # Login page tests
│   ├── store/
│   │   └── index.test.ts            # Zustand store tests
│   ├── utils/
│   │   ├── api.test.ts              # API client tests
│   │   └── format.test.ts           # Utility function tests
│   └── test/
│       └── setup.ts                 # Test environment setup

packages/api/
└── tests/
    ├── api.test.js                  # API integration tests
    └── gst.test.js                  # GST calculation tests

tests/e2e/
├── auth.spec.js                     # Authentication flow
├── invoice-delivery.spec.js         # Invoice delivery workflow
├── pos.spec.js                      # POS system workflow
└── users.spec.js                    # User management
```

---

## 🎯 Test Coverage

### **Frontend Unit Tests** (packages/web/src)

#### **Store Tests** (`store/index.test.ts`)
- ✅ useAuthStore: login, logout, user state
- ✅ useThemeStore: theme toggle, persistence
- ✅ useToastStore: notifications, dismiss
- ✅ useAppStore: UI state management
- ✅ useInventoryFilterStore: filter state

#### **API Client Tests** (`utils/api.test.ts`)
- ✅ GET requests with query params
- ✅ POST, PUT, PATCH, DELETE methods
- ✅ Error handling and ApiError class
- ✅ File upload with FormData
- ✅ Authorization headers

#### **Format Utility Tests** (`utils/format.test.ts`)
- ✅ Currency formatting (₹1,234.56)
- ✅ Date formatting (DD/MM/YYYY)
- ✅ GSTIN validation
- ✅ String utilities (truncate, capitalize)

#### **Component Tests**
- ✅ **Shared.test.tsx**: Button, Card, Input, Select, Textarea, Badge, Spinner, EmptyState
- ✅ **ToastContainer.test.tsx**: Toast rendering, auto-dismiss, manual dismiss
- ✅ **LoginPage.test.tsx**: Form submission, success/error handling, loading states

### **Backend Tests** (packages/api/tests)

#### **API Integration Tests** (`api.test.js`)
- ✅ Authentication endpoints
- ✅ CRUD operations for all resources
- ✅ Authorization checks
- ✅ Data validation

#### **Business Logic Tests** (`gst.test.js`)
- ✅ GST calculations
- ✅ Tax breakdowns
- ✅ Round-off handling

### **E2E Tests** (tests/e2e)

#### **Auth Flow** (`auth.spec.js`)
- ✅ Login with valid credentials
- ✅ Login failure handling
- ✅ Session persistence
- ✅ Logout flow

#### **Invoice Delivery** (`invoice-delivery.spec.js`)
- ✅ Create invoice with delivery
- ✅ Print challan
- ✅ Mark delivered
- ✅ Generate final invoice

#### **POS Workflow** (`pos.spec.js`)
- ✅ Create new invoice
- ✅ Add products
- ✅ Apply discounts
- ✅ Record payment
- ✅ Print invoice

#### **User Management** (`users.spec.js`)
- ✅ Create user
- ✅ Edit user
- ✅ Deactivate user
- ✅ Role-based access

---

## 🚀 Running Tests

### **Quick Commands**

```bash
# Run all unit tests
./scripts/dev.sh test

# Run E2E tests (requires servers running)
./scripts/dev.sh test:e2e

# Run specific test file
npm run test -- packages/web/src/store/index.test.ts -w @modernex/web

# Watch mode for development
npm run test:watch -w @modernex/web

# Coverage report
npm run test:coverage -w @modernex/web
```

### **Manual Commands**

```bash
# Frontend unit tests
cd packages/web
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report

# Backend tests
cd packages/api
npm test

# E2E tests (requires servers running)
npm run test:e2e
```

---

## 🔧 Test Configuration

### **Vitest Configuration** (`packages/web/vite.config.js`)

```javascript
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  css: false,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    exclude: ['node_modules/', 'src/test/'],
  },
}
```

### **Test Setup** (`packages/web/src/test/setup.ts`)

Mocks:
- `window.matchMedia` for theme tests
- `IntersectionObserver` for lazy loading
- `ResizeObserver` for responsive components

Auto-cleanup after each test with `@testing-library/react`

### **Playwright Configuration** (`playwright.config.js`)

- Chromium, Firefox, WebKit browsers
- Base URL: http://localhost:5173
- Screenshots on failure
- Trace on first retry

---

## ✍️ Writing Tests

### **Unit Test Example**

```typescript
// Store test
import { renderHook, act } from '@testing-library/react';
import { useAuthStore } from '@/store';

it('should handle login', async () => {
  const { result } = renderHook(() => useAuthStore());
  
  await act(async () => {
    await result.current.login('admin', 'admin123');
  });
  
  expect(result.current.user).toBeDefined();
  expect(result.current.isAuthenticated).toBe(true);
});
```

### **Component Test Example**

```typescript
// Component test
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Shared';

it('should handle click events', () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click</Button>);
  
  fireEvent.click(screen.getByText('Click'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});
```

### **E2E Test Example**

```javascript
// E2E test
test('should create invoice', async ({ page }) => {
  await page.goto('/pos');
  
  await page.fill('[placeholder="Search"]', 'Granite');
  await page.click('text=Add');
  
  await page.fill('[name="quantity"]', '10');
  await page.click('text=Create Invoice');
  
  await expect(page.locator('.invoice-number')).toBeVisible();
});
```

---

## 🐛 Debugging Tests

### **Failed Test Investigation**

```bash
# Run single test with verbose output
npm test -- -t "test name" --reporter=verbose

# Debug in VS Code
# Add breakpoint and use "Debug Test" code lens

# Playwright UI mode for E2E
npx playwright test --ui
```

### **Common Issues**

| Issue | Solution |
|-------|----------|
| Tests timeout | Increase timeout in test config |
| Mock not working | Check vi.mock() path matches import |
| Component not rendering | Verify test setup imports jsdom |
| E2E test fails | Check if servers are running |
| Store state leaks | Clear store in beforeEach() |

---

## 📊 CI/CD Integration

### **GitHub Actions** (`.github/workflows/test.yml`)

```yaml
- name: Run Unit Tests
  run: npm test
  
- name: Run E2E Tests
  run: |
    npm run dev &
    npm run api:dev &
    npx playwright test
```

### **Pre-commit Hook** (`.husky/pre-commit`)

```bash
npm test -- --run
```

---

## 🎓 Best Practices

### **DO:**
- ✅ Test user behavior, not implementation details
- ✅ Use `screen` queries (getByRole, getByLabelText)
- ✅ Mock external dependencies (API calls, timers)
- ✅ Write descriptive test names (`should X when Y`)
- ✅ Arrange-Act-Assert pattern
- ✅ Clean up side effects in afterEach()

### **DON'T:**
- ❌ Test library code (React, Zustand)
- ❌ Over-mock (test becomes meaningless)
- ❌ Brittle selectors (CSS classes, indexes)
- ❌ Large snapshots (hard to review)
- ❌ Async without proper waiting
- ❌ Shared state between tests

---

## 📈 Coverage Goals

| Area | Current | Target |
|------|---------|--------|
| Stores | 100% | 100% |
| API Client | 100% | 100% |
| Utils | 95% | 95% |
| Components | 80% | 85% |
| Pages | 50% | 70% |
| E2E Critical Paths | 100% | 100% |

---

## 🔄 Continuous Improvement

### **Adding New Tests**

1. Create test file next to source: `Component.tsx` → `Component.test.tsx`
2. Import dependencies and setup mocks
3. Write tests covering happy path + edge cases
4. Run `npm run test:coverage` to check gaps
5. Update this documentation if needed

### **Test Maintenance**

- Review and update tests when refactoring
- Remove obsolete tests for deleted features
- Keep mocks in sync with real APIs
- Monitor test execution time
- Update Playwright browsers quarterly

---

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Docs](https://playwright.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

## 🆘 Getting Help

**Tests failing?**
1. Check error message and stack trace
2. Review recent changes to source code
3. Verify mocks match current API
4. Run in watch mode for faster iteration
5. Ask team in #testing channel

**Need to add tests?**
1. Review similar existing tests
2. Follow patterns in this guide
3. Run coverage report to find gaps
4. Submit PR with tests + code changes

---

**Last Updated**: January 2025  
**Maintained By**: Development Team
