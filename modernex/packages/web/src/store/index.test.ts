// ══════════════════════════════════════════════════════
// Zustand Store Tests
// ══════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthStore, useThemeStore, useToastStore, useAppStore, useCartStore } from './index';
import type { User } from '@/types';

// Mock API
vi.mock('@/utils/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.logout();
    });
  });

  it('should initialize with null user', () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.user).toBeNull();
  });

  it('should set user on successful login', async () => {
    const mockUser: User = {
      id: 1,
      username: 'testuser',
      fullName: 'Test User',
      role: 'admin',
      active: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    const { api } = await import('@/utils/api');
    vi.mocked(api.post).mockResolvedValue({ user: mockUser });

    const { result } = renderHook(() => useAuthStore());

    await act(async () => {
      await result.current.login('testuser', 'password');
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.error).toBeNull();
  });

  it('should set error on failed login', async () => {
    const { api } = await import('@/utils/api');
    vi.mocked(api.post).mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuthStore());

    await act(async () => {
      try {
        await result.current.login('testuser', 'wrongpassword');
      } catch {
        // Expected to throw
      }
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toBe('Invalid credentials');
  });

  it('should clear user on logout', async () => {
    const mockUser: User = {
      id: 1,
      username: 'testuser',
      fullName: 'Test User',
      role: 'admin',
      active: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    const { api } = await import('@/utils/api');
    vi.mocked(api.post).mockResolvedValue({ user: mockUser });

    const { result } = renderHook(() => useAuthStore());

    await act(async () => {
      await result.current.login('testuser', 'password');
    });

    expect(result.current.user).toEqual(mockUser);

    vi.mocked(api.post).mockResolvedValue({});

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
  });

  it('should update user', () => {
    const { result } = renderHook(() => useAuthStore());

    const updatedUser: User = {
      id: 1,
      username: 'testuser',
      fullName: 'Updated Name',
      role: 'admin',
      active: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    };

    act(() => {
      result.current.updateUser(updatedUser);
    });

    expect(result.current.user).toEqual(updatedUser);
  });

  it('should clear error', async () => {
    const { api } = await import('@/utils/api');
    vi.mocked(api.post).mockRejectedValue(new Error('Test error'));

    const { result } = renderHook(() => useAuthStore());

    await act(async () => {
      try {
        await result.current.login('testuser', 'wrongpassword');
      } catch {
        // Expected
      }
    });

    expect(result.current.error).toBe('Test error');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});

describe('useThemeStore', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    // Reset DOM
    document.documentElement.removeAttribute('data-theme');
  });

  it('should initialize with default theme', () => {
    const { result } = renderHook(() => useThemeStore());
    expect(['dark', 'light']).toContain(result.current.theme);
  });

  it('should toggle theme', () => {
    const { result } = renderHook(() => useThemeStore());
    const initialTheme = result.current.theme;

    act(() => {
      result.current.toggle();
    });

    const newTheme = result.current.theme;
    expect(newTheme).not.toBe(initialTheme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(newTheme);
  });

  it('should set theme', () => {
    const { result } = renderHook(() => useThemeStore());

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should persist theme to localStorage', () => {
    const { result } = renderHook(() => useThemeStore());

    act(() => {
      result.current.setTheme('light');
    });

    expect(localStorage.getItem('modernex-theme')).toContain('light');
  });
});

describe('useToastStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useToastStore());
    act(() => {
      result.current.dismissAll();
    });
  });

  it('should initialize with empty toasts', () => {
    const { result } = renderHook(() => useToastStore());
    expect(result.current.toasts).toHaveLength(0);
  });

  it('should add toast notification', () => {
    const { result } = renderHook(() => useToastStore());

    act(() => {
      result.current.notify('Test message', 'success');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe('Test message');
    expect(result.current.toasts[0]?.type).toBe('success');
  });

  it('should add multiple toasts', () => {
    const { result } = renderHook(() => useToastStore());

    act(() => {
      result.current.notify('Message 1', 'info');
      result.current.notify('Message 2', 'warning');
      result.current.notify('Message 3', 'error');
    });

    expect(result.current.toasts).toHaveLength(3);
  });

  it('should dismiss specific toast', () => {
    const { result } = renderHook(() => useToastStore());

    act(() => {
      result.current.notify('Message 1', 'info');
      result.current.notify('Message 2', 'warning');
    });

    const toastId = result.current.toasts[0]?.id;
    expect(toastId).toBeDefined();

    act(() => {
      result.current.dismiss(toastId!);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe('Message 2');
  });

  it('should dismiss all toasts', () => {
    const { result } = renderHook(() => useToastStore());

    act(() => {
      result.current.notify('Message 1', 'info');
      result.current.notify('Message 2', 'warning');
      result.current.notify('Message 3', 'error');
    });

    expect(result.current.toasts).toHaveLength(3);

    act(() => {
      result.current.dismissAll();
    });

    expect(result.current.toasts).toHaveLength(0);
  });
});

describe('useAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('should toggle sidebar', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.sidebarCollapsed).toBe(true);

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.sidebarCollapsed).toBe(false);
  });

  it('should set sidebar collapsed', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setSidebarCollapsed(true);
    });

    expect(result.current.sidebarCollapsed).toBe(true);

    act(() => {
      result.current.setSidebarCollapsed(false);
    });

    expect(result.current.sidebarCollapsed).toBe(false);
  });

  it('should set loading state', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.setLoading(false);
    });

    expect(result.current.loading).toBe(false);
  });

  it('should persist sidebar state', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setSidebarCollapsed(true);
    });

    expect(localStorage.getItem('modernex-app')).toContain('true');
  });
});

describe('useCartStore', () => {
  const product = {
    id: 'SLAB-001',
    variety: 'Paradiso Classic',
    kind: 'slab',
    hsn: '2516',
    uom: 'sqft',
    rate_paise: 125000,
    stock: 3,
    dimensions: {
      size_lw: '2700x1800',
      thickness_mm: 20,
      sqft: 33.75,
    },
  };

  beforeEach(() => {
    const { result } = renderHook(() => useCartStore());
    act(() => {
      result.current.clearCart();
      result.current.setCustomerId('');
      if (!result.current.cartOpen) {
        result.current.toggleCart();
      }
    });
  });

  it('should add an item and increment quantity until stock limit', () => {
    const { result } = renderHook(() => useCartStore());

    act(() => {
      expect(result.current.addItem(product)).toBe('added');
      expect(result.current.addItem(product)).toBe('updated');
      expect(result.current.addItem(product)).toBe('updated');
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.quantity).toBe(3);

    act(() => {
      expect(result.current.addItem(product)).toBe('max_stock');
    });

    expect(result.current.items[0]?.quantity).toBe(3);
  });

  it('should clamp quantity adjustments within valid bounds', () => {
    const { result } = renderHook(() => useCartStore());

    act(() => {
      result.current.addItem(product);
      result.current.adjustQuantity(product.id, -5);
    });

    expect(result.current.items[0]?.quantity).toBe(1);

    act(() => {
      result.current.adjustQuantity(product.id, 10);
    });

    expect(result.current.items[0]?.quantity).toBe(product.stock);
  });

  it('should update rate and remove items cleanly', () => {
    const { result } = renderHook(() => useCartStore());

    act(() => {
      result.current.addItem(product);
      result.current.setRate(product.id, 1499.5);
    });

    expect(result.current.items[0]?.ratePaise).toBe(149950);

    act(() => {
      result.current.removeItem(product.id);
    });

    expect(result.current.items).toHaveLength(0);
  });
});
