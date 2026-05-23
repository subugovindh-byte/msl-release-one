// ══════════════════════════════════════════════════════
// Shared UI Components
// ══════════════════════════════════════════════════════

import React, { type ReactNode, useRef, useState, useCallback } from 'react';

// ─── Button ───
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const variantClass = {
    primary: 'btn-p',
    secondary: 'btn-s',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  }[variant];

  const sizeClass = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  }[size];

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}

// ─── Card ───
interface CardProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

export function Card({ children, title, className = '' }: CardProps) {
  return (
    <div className={`card ${className}`.trim()}>
      {title && <div className="card-header">{title}</div>}
      <div className="card-body">{children}</div>
    </div>
  );
}

// ─── Input ───
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="fg">
      {label && (
        <label className="fl" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`fi ${error ? 'fi-error' : ''} ${className}`.trim()}
        {...props}
      />
      {error && <div className="field-error">{error}</div>}
      {helperText && !error && <div className="field-help">{helperText}</div>}
    </div>
  );
}

// ─── Select ───
interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  label,
  error,
  options,
  placeholder,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="fg">
      {label && (
        <label className="fl" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`fi ${error ? 'fi-error' : ''} ${className}`.trim()}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

// ─── Textarea ───
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Textarea({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}: TextareaProps) {
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="fg">
      {label && (
        <label className="fl" htmlFor={textareaId}>
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`fi ${error ? 'fi-error' : ''} ${className}`.trim()}
        {...props}
      />
      {error && <div className="field-error">{error}</div>}
      {helperText && !error && <div className="field-help">{helperText}</div>}
    </div>
  );
}

// ─── Badge ───
interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variantClass = {
    default: 'badge-default',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
  }[variant];

  return <span className={`badge ${variantClass} ${className}`.trim()}>{children}</span>;
}

// ─── Spinner ───
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClass = {
    sm: 'spinner-sm',
    md: 'spinner-md',
    lg: 'spinner-lg',
  }[size];

  return <div className={`spinner ${sizeClass} ${className}`.trim()} />;
}

// ─── Empty State ───
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: 'var(--t3)',
      }}
    >
      <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: '14px', marginBottom: '16px' }}>{description}</div>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Stat / KPI Card ───
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
}

export function StatCard({ label, value, sub, valueColor = 'var(--t1)' }: StatCardProps) {
  return (
    <div style={{
      backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)',
      borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        fontSize: 11, color: 'var(--t3)', marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: valueColor, marginBottom: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{sub}</div>}
    </div>
  );
}

// ─── Modal ───
interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}

export function Modal({ open, onClose, children, maxWidth = 480 }: ModalProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--bd)',
        borderRadius: 10, padding: 24, width: '100%', maxWidth,
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} maxWidth={380}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 15 }}>{title}</p>
      {message && <p style={{ margin: '0 0 20px', color: 'var(--t3)', fontSize: 13 }}>{message}</p>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{ padding: '8px 18px', border: '1px solid var(--bd)', borderRadius: 5, background: 'var(--bg2)', color: 'var(--t2)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          style={{ padding: '8px 18px', border: 'none', borderRadius: 5, background: danger ? 'var(--red)' : 'var(--rust)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ─── Page Header ───
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 style={{ marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Receipt Attach ───────────────────────────────────────────────────────────
// Dual-mode: capture="environment" (camera on mobile) + regular file picker.
// Stores as a data URI; emits via onChange. Supports image preview + PDF icon.

interface ReceiptAttachProps {
  value?: string;
  onChange: (dataUri: string) => void;
  onClear: () => void;
  maxSizeMB?: number;
}

export function ReceiptAttach({ value, onChange, onClear, maxSizeMB = 5 }: ReceiptAttachProps) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = useCallback((file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File too large — max ${maxSizeMB} MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }, [maxSizeMB, onChange]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const isImage = value && (value.startsWith('data:image') || /\.(jpe?g|png|webp|gif)$/i.test(value));
  const isPdf   = value && (value.startsWith('data:application/pdf') || value.endsWith('.pdf'));

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {isImage && (
          <img
            src={value}
            alt="Receipt"
            style={{ maxHeight: 110, maxWidth: 180, borderRadius: 6, border: '1px solid var(--bd)', objectFit: 'cover', cursor: 'pointer' }}
            onClick={() => window.open(value, '_blank')}
          />
        )}
        {isPdf && (
          <div
            style={{ width: 90, height: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', gap: 6 }}
            onClick={() => window.open(value, '_blank')}
          >
            <span style={{ fontSize: 28 }}>📄</span>
            <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>PDF</span>
          </div>
        )}
        {!isImage && !isPdf && (
          <div style={{ width: 90, height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 6, gap: 4 }}>
            <span style={{ fontSize: 24 }}>📎</span>
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>Attached</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--rust)', fontWeight: 600, textDecoration: 'none' }}>
            View Receipt ↗
          </a>
          <button
            type="button"
            onClick={() => { onClear(); if (fileRef.current) fileRef.current.value = ''; if (cameraRef.current) cameraRef.current.value = ''; }}
            style={{ fontSize: 11, color: 'var(--t3)', background: 'none', border: '1px solid var(--bd)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{ fontSize: 11, color: 'var(--t2)', background: 'none', border: '1px solid var(--bd)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
          >
            Replace
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && readFile(e.target.files[0])} />
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${dragging ? 'var(--rust)' : 'var(--bd)'}`,
        borderRadius: 8,
        padding: '16px 20px',
        backgroundColor: dragging ? 'rgba(180,60,30,0.04)' : 'var(--bg2)',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
    >
      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        {...{ capture: 'environment' } as any}
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && readFile(e.target.files[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && readFile(e.target.files[0])}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', border: '1px solid var(--bd)', borderRadius: 6,
            backgroundColor: 'var(--bg1)', color: 'var(--t2)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 16 }}>📷</span> Take Photo
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', border: '1px solid var(--bd)', borderRadius: 6,
            backgroundColor: 'var(--bg1)', color: 'var(--t2)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 16 }}>📎</span> Choose File
        </button>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>
          or drag & drop · image / PDF · max {maxSizeMB} MB
        </span>
      </div>
    </div>
  );
}

// ─── Error Boundary ───
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <h2>Something went wrong</h2>
          <p style={{ color: 'var(--t3)' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            className="btn btn-p"
            onClick={() => window.location.reload()}
            style={{ marginTop: '16px' }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
