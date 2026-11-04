import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBackend } from '../api';
import type { Instrument, SearchResult } from '../../shared/types';

export interface PickedInstrument {
  symbol: string;
  name: string;
  currency: string;
  /** true when not yet in the user's instruments */
  isNew: boolean;
  manual?: boolean;
  type?: string;
}

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function InstrumentPicker({ instruments, value, onChange }: { instruments: Instrument[]; value: PickedInstrument | null; onChange: (v: PickedInstrument | null) => void }) {
  const backend = useBackend();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const search = useQuery({
    queryKey: ['search', dq],
    queryFn: () => backend.search(dq),
    enabled: dq.length >= 2,
    staleTime: 60 * 60_000,
    retry: 0,
  });

  if (value) {
    return (
      <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{value.name}</b>{' '}
          <span className="muted small">
            {value.manual ? 'support manuel' : value.symbol} · {value.currency}
          </span>
        </div>
        <button type="button" className="btn ghost small" onClick={() => onChange(null)}>
          Changer
        </button>
      </div>
    );
  }

  const s = q.trim().toLowerCase();
  const local = instruments.filter((i) => !s || i.name.toLowerCase().includes(s) || i.symbol.toLowerCase().includes(s)).slice(0, 6);
  const remote = (search.data ?? []).filter((r) => !instruments.some((i) => i.symbol === r.symbol)).slice(0, 8);
  const pickRemote = (r: SearchResult) => onChange({ symbol: r.symbol, name: r.name, currency: r.currency || 'EUR', isNew: true, type: r.type });

  return (
    <div>
      <input className="input" autoFocus placeholder="Nom, ticker ou ISIN (ex. LVMH, AAPL, FR0000121014)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list" style={{ maxHeight: 260, overflow: 'auto', marginTop: 6 }}>
        {local.map((i) => (
          <button type="button" key={i.symbol} className="row btn ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 8 }} onClick={() => onChange({ ...i, isNew: false })}>
            <div className="row-main">
              <div className="row-title">{i.name}</div>
              <div className="row-sub">{i.manual ? 'Support manuel' : i.symbol} · déjà dans votre portefeuille</div>
            </div>
          </button>
        ))}
        {remote.map((r) => (
          <button type="button" key={r.symbol} className="row btn ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 8 }} onClick={() => pickRemote(r)}>
            <div className="row-main">
              <div className="row-title">{r.name}</div>
              <div className="row-sub">
                {r.symbol} · {r.exchange ?? ''} {r.type ? `· ${r.type}` : ''} {r.currency ? `· ${r.currency}` : ''}
              </div>
            </div>
          </button>
        ))}
        {search.isFetching && <div className="hint" style={{ padding: 8 }}>Recherche…</div>}
        {search.error && <div className="hint" style={{ padding: 8 }}>Recherche indisponible : {(search.error as Error).message}</div>}
        {q.trim().length >= 2 && (
          <button
            type="button"
            className="row btn ghost"
            style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 8 }}
            onClick={() => {
              const t = q.trim();
              // A ticker typed directly (e.g. "CW8.PA") is kept as a market symbol
              if (/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(t)) onChange({ symbol: t, name: t, currency: t.includes('.') ? 'EUR' : 'USD', isNew: true });
              else onChange({ symbol: 'manual:' + slug(t), name: t, currency: 'EUR', isNew: true, manual: true });
            }}
          >
            <div className="row-main">
              <div className="row-title">Utiliser « {q.trim()} »</div>
              <div className="row-sub">
                {/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(q.trim())
                  ? 'Comme ticker de marché'
                  : 'Comme support à valorisation manuelle (fonds PEE, non coté…)'}
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) +
    '-' +
    Math.random().toString(36).slice(2, 6)
  );
}
