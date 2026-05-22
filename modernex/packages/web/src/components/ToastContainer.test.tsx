// ══════════════════════════════════════════════════════
// ToastContainer Component Tests
// ══════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import type { Toast } from '@/types';

const mockDismiss = vi.fn();
const mockToasts: Toast[] = [];

vi.mock('@/store', () => ({
  useToastStore: () => ({
    toasts: mockToasts,
    dismiss: mockDismiss,
  }),
}));

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToasts.length = 0;
  });

  it('should render nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('should render success toast', () => {
    mockToasts.push({
      id: '1',
      message: 'Success message',
      type: 'success',
      duration: 5000,
    });

    render(<ToastContainer />);
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('should render error toast', () => {
    mockToasts.push({
      id: '2',
      message: 'Error message',
      type: 'error',
      duration: 5000,
    });

    render(<ToastContainer />);
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('should render multiple toasts', () => {
    mockToasts.push(
      { id: '1', message: 'Toast 1', type: 'info', duration: 5000 },
      { id: '2', message: 'Toast 2', type: 'warning', duration: 5000 },
      { id: '3', message: 'Toast 3', type: 'success', duration: 5000 }
    );

    render(<ToastContainer />);
    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
    expect(screen.getByText('Toast 3')).toBeInTheDocument();
  });

  it('should handle dismiss on button click', () => {
    mockToasts.push({
      id: 'test-id',
      message: 'Test message',
      type: 'info',
      duration: 5000,
    });

    render(<ToastContainer />);
    
    const dismissButton = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissButton);
    
    expect(mockDismiss).toHaveBeenCalledWith('test-id');
  });
});
