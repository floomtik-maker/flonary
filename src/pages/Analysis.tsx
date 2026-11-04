import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../lib/usePortfolio';
import { computeSignals, concentration, maxDrawdown, RISK_LABELS, riskClass } from '../../shared/analysis';
import { regionOf } from '../../shared/geo';
import { addMonths } from '../../shared/series';
import { BarList, Empty, PageLoading, Segmented } from '../components/ui';
import { ASSET_CLASS_LABELS, BROKER_LABELS, pct, signedPct } from '../lib/format';

type Dim = 'region' | 'country' | 'sector' | 'asset' | 'currency' | 'account';
const DIMS: { value: Dim; label: string }[] = [
  { value: 'region', label: 'Zones' },
  { value: 'country', label: 'Pays' },
  { value: 'sector', label: 'Secteurs' },
  { value: 'asset', label: 'Actifs' },
  { value: 'currency', label: 'Devises' },
  { value: 'account', label: 'Comptes' },
];
const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

export function Analysis() {
  const { state, loading, error } = usePortfolio();
  const [dim, setDim] = useState<Dim>('region');

  const analysis = useMemo(() => {
    if (!state) return null;
    const { positions, summary, series } = state.result;
    const total = summary.totalValue || 1;
    const group = (key: (p: (typeof positions)[number]) => string) => {
      const m = new Map<string, number>();
      for (const p of positions) m.set(key(p), (m.get(key(p)) ?? 0) + p.valueEUR);
      if (summary.cash > 1) m.set('Liquidités', (m.get('Liquidités') ?? 0) + summary.cash);
      const items = [...m.entries()].map(([label, v]) => ({ label, value: v / total })).sort((a, b) => b.value - a.value);
      if (items.length > 8) {
        const rest = items.slice(7).reduce((s, i) => s + i.value, 0);
        return [...items.slice(0, 7), { label: 'Autres', value: rest }];
      }
      return items;
    };
    const accName = (p: (typeof positions)[number]) => {
      const a = state.data.accounts.find((x) => x.id === p.accounts[0]);
      return a ? `${a.name}` : '—';
    };
    const exposures: Record<Dim, { label: string; value: number }[]> = {
      region: group((p) => regionOf(p.country)),
      country: group((p) => p.country ?? 'Non renseigné'),
      sector: group((p) => p.sector ?? (p.asset_class === 'etf' ? 'ETF diversifié' : 'Non renseigné')),
      asset: group((p) => ASSET_CLASS_LABELS[p.asset_class] ?? 'Autre'),
      currency: group((p) => p.currency.toUpperCase().replace('GBP', 'GBP')),
      account: group(accName),
    };

    // Portfolio risk from the daily time-weighted index over 1 year
    const since = addMonths(state.today, -12);
    const twr = series.filter((s) => s.date >= since).map((s) => s.twr);
    const rets: number[] = [];
    for (let i = 1; i < twr.length; i++) rets.push(twr[i] / twr[i - 1] - 1);
    const mean = rets.reduce((s, x) => s + x, 0) / (rets.length || 1);
    const vol = rets.length > 20 ? Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252) : null;
    const mdd = maxDrawdown(twr);
    const conc = concentration(positions.map((p) => p.weight));
    const first = series.find((s) => s.value > 0);
    const last = series.at(-1);
    const years = first && last ? (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 86_400_000) : 0;
    const annualized = last && years > 0.9 ? Math.pow(last.twr, 1 / years) - 1 : null;

    const signals = positions
      .filter((p) => !p.symbol.startsWith('manual:'))
      .map((p) => ({ p, s: computeSignals(state.histories[p.symbol]?.points ?? [], p.avgPrice) }))
      .filter((x) => x.s && (x.s.tone === 'buy' || x.s.tone === 'take_profit' || x.s.tone === 'caution'));

    const perPosRisk = positions.map((p) => {
      const pts = (state.histories[p.symbol]?.points ?? []).filter((x) => x[0] >= since).map((x) => x[1]);
      const r: number[] = [];
      for (let i = 1; i < pts.length; i++) r.push(pts[i] / pts[i - 1] - 1);
      const m = r.reduce((s, x) => s + x, 0) / (r.length || 1);
      const v = r.length > 20 ? Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) : null;
      return { p, vol: v, risk: riskClass(v) };
    });

    const alerts: string[] = [];
    const top = positions[0];
    if (top && top.weight > 0.25) alerts.push(`${top.name} pèse ${pct(top.weight)} du portefeuille : forte concentration sur une seule ligne.`);
    const topRegion = exposures.region[0];
    if (topRegion && topRegion.value > 0.7 && topRegion.label !== 'Monde (diversifié)') alerts.push(`${pct(topRegion.value)} du portefeuille est exposé à la zone ${topRegion.label}.`);
    const usd = exposures.currency.find((c) => c.label === 'USD');
    if (usd && usd.value > 0.4) alerts.push(`${pct(usd.value)} en dollars : sensible aux variations EUR/USD.`);
    for (const p of positions) if (p.unrealizedPct < -0.25) alerts.push(`${p.name} est en perte de ${pct(-p.unrealizedPct)} par rapport à votre PRU.`);
    const unknown = exposures.country.find((c) => c.label === 'Non renseigné');
    if (unknown && unknown.value > 0.05) alerts.push(`${pct(unknown.value)} sans pays renseigné : complétez la fiche des titres pour affiner l'exposition.`);

    return { exposures, vol, mdd, conc, annualized, signals, perPosRisk, alerts };
  }, [state]);

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state || !analysis) return <PageLoading />;
  if (state.result.positions.length === 0)
    return (
      <div className="card">
        <Empty title="Rien à analyser pour l'instant">Ajoutez des positions pour voir votre exposition et votre risque.</Empty>
      </div>
    );

  const riskCls = riskClass(analysis.vol);
  return (
    <>
      <div className="page-head">
        <h1>Analyse</h1>
      </div>
      <div className="grid grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-title" style={{ flexWrap: 'wrap' }}>
              Exposition
              <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <Segmented value={dim} onChange={setDim} options={DIMS} />
              </div>
            </div>
            <BarList items={analysis.exposures[dim]} colors={analysis.exposures[dim].map((_, i) => COLORS[i % COLORS.length])} />
            <p className="hint">Les ETF sont comptés dans leur zone principale (ex. un ETF MSCI World en « Monde »). Modifiez la fiche d'un titre pour corriger.</p>
          </section>

          <section className="card">
            <div className="card-title">Signaux sur vos titres</div>
            {analysis.signals.length === 0 && <p className="muted small">Aucun signal particulier : vos titres sont dans leur zone neutre.</p>}
            <div className="list">
              {analysis.signals.map(({ p, s }) => (
                <Link key={p.symbol} to={`/positions/${encodeURIComponent(p.symbol)}`} className="row">
                  <div className="row-main">
                    <div className="row-title">{p.name}</div>
                    <div className="row-sub">{s!.reasons.slice(0, 2).join(' · ')}</div>
                  </div>
                  <span className={`pill ${s!.tone === 'buy' ? 'up' : 'warn'}`}>{s!.tone === 'buy' ? "Zone d'achat" : s!.tone === 'take_profit' ? 'Prise de bénéfices' : 'Prudence'}</span>
                </Link>
              ))}
            </div>
            <p className="disclaimer">Indicateurs techniques automatiques, à titre informatif. Pas un conseil en investissement.</p>
          </section>

          <section className="card">
            <div className="card-title">Risque par ligne</div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Titre</th>
                    <th className="r">Poids</th>
                    <th className="r">Volatilité 1 an</th>
                    <th>Risque (1–7)</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.perPosRisk.map(({ p, vol, risk }) => (
                    <tr key={p.symbol}>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</td>
                      <td className="r num">{pct(p.weight)}</td>
                      <td className="r num">{vol != null ? pct(vol) : '—'}</td>
                      <td>{risk ? <RiskMeter level={risk} /> : <span className="muted small">historique insuffisant</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-title">Risque du portefeuille</div>
            {riskCls ? (
              <>
                <RiskMeter level={riskCls} large />
                <p className="small" style={{ marginBottom: 0 }}>
                  Niveau <b>{riskCls}/7 · {RISK_LABELS[riskCls]}</b>, sur l'échelle européenne SRI utilisée pour les fonds.
                </p>
              </>
            ) : (
              <p className="muted small">Il faut quelques semaines d'historique pour estimer le risque.</p>
            )}
            <div className="list" style={{ marginTop: 8 }}>
              <div className="row">
                <div className="row-main">Volatilité (1 an)</div>
                <span className="num">{analysis.vol != null ? pct(analysis.vol) : '—'}</span>
              </div>
              <div className="row">
                <div className="row-main">Pire baisse (1 an)</div>
                <span className="num down">{pct(analysis.mdd)}</span>
              </div>
              <div className="row">
                <div className="row-main">Rendement annualisé</div>
                <span className="num">{analysis.annualized != null ? signedPct(analysis.annualized) : '—'}</span>
              </div>
              <div className="row">
                <div className="row-main" title="Nombre de lignes de même poids qui donneraient la même concentration">
                  Diversification effective
                </div>
                <span className="num">{analysis.conc.effective.toFixed(1)} lignes</span>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-title">Points d'attention</div>
            {analysis.alerts.length === 0 ? (
              <p className="muted small">Rien à signaler : portefeuille équilibré.</p>
            ) : (
              <ul className="reasons" style={{ marginTop: 0 }}>
                {analysis.alerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </section>
          <section className="card small muted">
            Répartition par courtier :{' '}
            {state.data.accounts
              .map((a) => BROKER_LABELS[a.broker])
              .filter((v, i, arr) => arr.indexOf(v) === i)
              .join(', ')}
          </section>
        </div>
      </div>
    </>
  );
}

function RiskMeter({ level, large }: { level: number; large?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }} aria-label={`Risque ${level} sur 7`}>
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          style={{
            width: large ? 34 : 14,
            height: large ? 26 : 10,
            borderRadius: 4,
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: i === level ? 'white' : 'var(--text-3)',
            background: i === level ? (level >= 6 ? 'var(--bad)' : level >= 4 ? 'var(--warn)' : 'var(--good)') : 'var(--surface-2)',
          }}
        >
          {large ? i : ''}
        </div>
      ))}
      {!large && <span className="small muted" style={{ marginLeft: 6 }}>{level}</span>}
    </div>
  );
}
