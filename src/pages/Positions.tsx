import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortfolio } from '../lib/usePortfolio';
import { Avatar, Gain, PageLoading, Segmented } from '../components/ui';
import { eur, money, pct, qty } from '../lib/format';

export function Positions() {
  const { state, loading, error } = usePortfolio();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const navigate = useNavigate();
  if (error) return <div className="card error">{error}</div>;
  if (loading || !state) return <PageLoading />;
  const { positions, closedPositions, summary } = state.result;
  const accountName = (id: string) => state.data.accounts.find((a) => a.id === id)?.name ?? '';

  return (
    <>
      <div className="page-head">
        <h1>Positions</h1>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: `En portefeuille (${positions.length})` },
            { value: 'closed', label: `Vendues (${closedPositions.length})` },
          ]}
        />
      </div>

      {tab === 'open' ? (
        <section className="card" style={{ padding: 8 }}>
          {/* Desktop table */}
          <div className="table-wrap hide-mobile">
            <table className="table">
              <thead>
                <tr>
                  <th>Titre</th>
                  <th className="r">Quantité</th>
                  <th className="r">PRU</th>
                  <th className="r">Cours</th>
                  <th className="r">Valeur</th>
                  <th className="r">+/- value latente</th>
                  <th className="r">Poids</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} className="click" onClick={() => navigate(`/positions/${encodeURIComponent(p.symbol)}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar symbol={p.symbol} name={p.name} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="muted small">
                            {p.symbol.startsWith('manual:') ? 'Valorisation manuelle' : p.symbol} · {p.accounts.map(accountName).join(', ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="r num">{qty(p.quantity)}</td>
                    <td className="r num">{money(p.avgPrice, p.currency)}</td>
                    <td className="r num">
                      {money(p.price, p.currency)}
                      {p.dayChangePct != null && (
                        <div className="small">
                          <Gain pct={p.dayChangePct / 100} />
                        </div>
                      )}
                    </td>
                    <td className="r num" style={{ fontWeight: 600 }}>{eur(p.valueEUR)}</td>
                    <td className="r">
                      <Gain value={p.unrealizedEUR} />
                      <div className="small">
                        <Gain pct={p.unrealizedPct} />
                      </div>
                    </td>
                    <td className="r num">{pct(p.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <div className="list show-mobile" style={{ padding: '0 8px' }}>
            {positions.map((p) => (
              <Link to={`/positions/${encodeURIComponent(p.symbol)}`} className="row" key={p.symbol}>
                <Avatar symbol={p.symbol} name={p.name} />
                <div className="row-main">
                  <div className="row-title">{p.name}</div>
                  <div className="row-sub">
                    {qty(p.quantity)} × PRU {money(p.avgPrice, p.currency)}
                  </div>
                </div>
                <div className="row-right">
                  <div className="num" style={{ fontWeight: 600 }}>{eur(p.valueEUR)}</div>
                  <div className="small">
                    <Gain pct={p.unrealizedPct} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {positions.length === 0 && <div className="empty">Aucune position ouverte.</div>}
        </section>
      ) : (
        <section className="card">
          <p className="hint" style={{ marginTop: 0 }}>
            Les gains des titres vendus restent dans votre performance globale : {' '}
            <Gain value={closedPositions.reduce((s, p) => s + p.realizedEUR + p.dividendsEUR, 0)} /> au total.
          </p>
          <div className="list">
            {closedPositions.map((p) => (
              <Link to={`/positions/${encodeURIComponent(p.symbol)}`} className="row" key={p.symbol}>
                <Avatar symbol={p.symbol} name={p.name} />
                <div className="row-main">
                  <div className="row-title">{p.name}</div>
                  <div className="row-sub">{p.dividendsEUR > 0 ? `dont ${eur(p.dividendsEUR)} de dividendes` : p.symbol}</div>
                </div>
                <div className="row-right">
                  <Gain value={p.realizedEUR + p.dividendsEUR} />
                  <div className="small muted">réalisé</div>
                </div>
              </Link>
            ))}
            {closedPositions.length === 0 && <div className="empty">Aucune position soldée pour l'instant.</div>}
          </div>
        </section>
      )}
      <p className="hint">
        Total réalisé (ventes) : <Gain value={summary.realized} /> · Dividendes : <Gain value={summary.dividends} />
      </p>
    </>
  );
}
