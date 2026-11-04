import { useEffect, type ReactNode } from 'react';
import { signedEur, signedPct, tone } from '../lib/format';
import { avatarColor, initials } from '../lib/format';

export function Gain({ value, pct, pill }: { value?: number; pct?: number; pill?: boolean }) {
  const t = tone(value ?? (pct ?? 0) * 1000);
  const content = (
    <>
      {value !== undefined && <span>{signedEur(value)}</span>}
      {pct !== undefined && <span>{value !== undefined ? `(${signedPct(pct)})` : signedPct(pct)}</span>}
    </>
  );
  if (pill) return <span className={`pill num ${t || 'neutral'}`}>{content}</span>;
  return <span className={`num ${t}`} style={{ display: 'inline-flex', gap: 4 }}>{content}</span>;
}

export function Avatar({ symbol, name }: { symbol: string; name: string }) {
  return (
    <div className="avatar" style={{ background: avatarColor(symbol) }} aria-hidden>
      {initials(name) || symbol.slice(0, 2)}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function PageLoading() {
  return (
    <div className="stack">
      <div className="card">
        <Skeleton h={16} w={140} />
        <div style={{ height: 10 }} />
        <Skeleton h={40} w={240} />
        <div style={{ height: 20 }} />
        <Skeleton h={220} />
      </div>
      <div className="card">
        <Skeleton h={18} w={180} />
        <div style={{ height: 14 }} />
        <Skeleton h={160} />
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function BarList({ items, colors }: { items: { label: string; value: number; sub?: string }[]; colors?: string[] }) {
  const max = Math.max(...items.map((i) => i.value), 0.0001);
  return (
    <div>
      {items.map((it, idx) => (
        <div className="bar-row" key={it.label} title={it.sub}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(it.value / max) * 100}%`, background: colors?.[idx] ?? 'var(--series-1)' }} />
          </div>
          <div className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
            {(it.value * 100).toFixed(it.value < 0.1 ? 1 : 0)} %
          </div>
        </div>
      ))}
    </div>
  );
}
