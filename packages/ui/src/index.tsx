import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/**
 * Aurora design-system primitives (FDD A.3). Framework-light React components bound to the
 * CSS contracts in components.css. RTL is handled by CSS logical properties and the document
 * `dir`, so no component needs to know the direction.
 */

export type Locale = 'en' | 'ar';
export interface Localized {
  en: string;
  ar?: string | undefined;
}

export function pickLocalized(text: Localized | string | null | undefined, locale: Locale): string {
  if (text === null || text === undefined) return '';
  if (typeof text === 'string') return text;
  return (locale === 'ar' ? text.ar : undefined) ?? text.en;
}

// ---------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
}

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    'au-btn',
    variant !== 'default' ? `au-btn--${variant}` : '',
    size === 'sm' ? 'au-btn--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={cls} {...rest} />;
}

// ---------------------------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------------------------
interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}

export function Field({ label, htmlFor, required, hint, error, children }: FieldProps) {
  return (
    <div className="au-field">
      <label className="au-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <span className="au-hint">{hint}</span> : null}
      {error ? (
        <span className="au-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`au-input ${className}`} {...rest} />;
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`au-select ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`au-textarea ${className}`} {...rest} />;
}

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="au-check">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      {breadcrumb ? <div className="au-breadcrumb">{breadcrumb}</div> : null}
      <header className="au-page-header">
        <div>
          <h1 className="au-page-title">{title}</h1>
          {subtitle ? <p className="au-page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="au-page-actions">{actions}</div> : null}
      </header>
    </>
  );
}

export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`au-panel ${className}`}>
      <div className="au-panel-body">
        {title ? <h2 className="au-panel-title">{title}</h2> : null}
        {children}
      </div>
    </section>
  );
}

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <div
      className={`au-callout ${tone !== 'info' ? `au-callout--${tone}` : ''}`}
      role={tone === 'danger' ? 'alert' : 'note'}
    >
      {children}
    </div>
  );
}

export function KeyValue({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="au-kv">
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'contents' }}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="au-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={t.key === active}
          className="au-tab"
          onClick={() => {
            onChange(t.key);
          }}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Status & states
// ---------------------------------------------------------------------------------------------
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'muted';
  children: ReactNode;
}) {
  return (
    <span className={`au-badge ${tone !== 'neutral' ? `au-badge--${tone}` : ''}`}>{children}</span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="au-empty">
      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</div>
      {hint ? <div>{hint}</div> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  requestId,
  retry,
  retryLabel = 'Retry',
}: {
  message: string;
  requestId?: string | undefined;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="au-error-state" role="alert">
      <div>{message}</div>
      {requestId ? <span className="mono">request {requestId}</span> : null}
      {retry ? (
        <div style={{ marginTop: 12 }}>
          <Button onClick={retry}>{retryLabel}</Button>
        </div>
      ) : null}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="au-loading" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="au-skeleton"
          style={{ marginBottom: 10, width: `${70 + ((i * 13) % 30)}%` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Data grid (universal list-view contract, FDD §2.3 — Phase 0 subset)
// ---------------------------------------------------------------------------------------------
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  width?: string;
}

export function DataGrid<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  emptyTitle,
  emptyHint,
  toolbar,
  footer,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  emptyTitle: string;
  emptyHint?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  caption: string;
}) {
  return (
    <section className="au-panel">
      {toolbar ? <div className="au-toolbar">{toolbar}</div> : null}
      <div className="au-table-wrap">
        <table className="au-table">
          <caption className="au-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.numeric ? 'num' : undefined}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ height: 'auto', whiteSpace: 'normal' }}>
                  <EmptyState title={emptyTitle} hint={emptyHint} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  data-clickable={onRowClick ? 'true' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={
                    onRowClick
                      ? () => {
                          onRowClick(row);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter') onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer ? <div className="au-pager">{footer}</div> : null}
    </section>
  );
}
