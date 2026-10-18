import { useEffect } from 'react';
import { useToastStore } from '@/store';
import type { Toast, ToastType } from '@/types';

const toastStyles: Record<ToastType, { bg: string; border: string }> = {
  success: { bg: '#10b981', border: '#059669' },
  error: { bg: '#ef4444', border: '#dc2626' },
  warning: { bg: 'var(--bg1)', border: 'var(--notice-rule)' },
  info: { bg: 'var(--rust)', border: 'var(--rustB)' },
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const style = toastStyles[toast.type];

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={`toast-item${toast.type === 'warning' ? ' toast-item--warning' : ''}`}
      role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
      style={{
        backgroundColor: style.bg,
        borderLeft: `${toast.type === 'warning' ? 2 : 4}px solid ${style.border}`,
        color: toast.type === 'warning' ? 'var(--notice-ink)' : '#fff',
        padding: '12px 16px',
        borderRadius: '6px',
        boxShadow: toast.type === 'warning' ? 'none' : '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 'min(360px, calc(100vw - 40px))',
        maxWidth: '100%',
        marginBottom: '8px',
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '14px', fontWeight: 500 }}>
        {toast.message}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: '0 0 0 12px',
          fontSize: '18px',
          lineHeight: 1,
          opacity: 0.8,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <>
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
