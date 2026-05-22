// ══════════════════════════════════════════════════════
// LoginPage Component Tests
// ══════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { useAuthStore, useThemeStore, useToastStore } from '@/store';

// Mock the navigate function
const mockNavigate = vi.fn();

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the stores
vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
  useThemeStore: vi.fn(),
  useToastStore: vi.fn(),
}));

function renderLoginPage() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  );
}

describe('LoginPage', () => {
  const mockLogin = vi.fn();
  const mockToggle = vi.fn();
  const mockNotify = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup store mocks
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: mockLogin,
      logout: vi.fn(),
    });
    
    vi.mocked(useThemeStore).mockReturnValue({
      theme: 'dark',
      toggle: mockToggle,
    });
    
    vi.mocked(useToastStore).mockReturnValue({
      toasts: [],
      notify: mockNotify,
      dismiss: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render login form', () => {
    renderLoginPage();
    
    expect(screen.getByText('MODERNEX STONES LLP')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should handle successful login', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      fullName: 'Test User',
      role: 'admin' as const,
      active: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    mockLogin.mockResolvedValue(mockUser);
    
    renderLoginPage();
    
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'password' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password');
      expect(mockNotify).toHaveBeenCalledWith('Signed in as Test User', 'success');
      expect(mockNavigate).toHaveBeenCalledWith('/pos');
    });
  });

  it('should handle login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    
    renderLoginPage();
    
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    fireEvent.change(usernameInput, { target: { value: 'wronguser' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Invalid credentials', 'error');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('should show loading state during login', async () => {
    mockLogin.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    renderLoginPage();
    
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'password' } });
    fireEvent.click(submitButton);
    
    expect(screen.getByText('Signing in…')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  it('should display demo account info', () => {
    renderLoginPage();
    
    expect(screen.getByText(/admin\/admin123/i)).toBeInTheDocument();
    expect(screen.getByText(/accounts\/accounts123/i)).toBeInTheDocument();
  });
});
