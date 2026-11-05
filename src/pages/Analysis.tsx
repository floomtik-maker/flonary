import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../lib/usePortfolio';
import { computeSignals, concentration, maxDrawdown, RISK_LABELS, riskClass } from '../../shared/analysis';
import { regionOf } from '../../shared/geo';
import { computeTax, envelopeOf, isTaxableEachYear } from '../../shared/tax';
import { addMonths } from '../../shared/series';
import { BarList, Empty, PageLoading, Segmented } from '../components/ui';
import { ASSET_CLASS_LABELS, BROKER_LABELS, eur, pct, signedEur, signedPct, tone } from '../lib/format';

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

    const tax = computeTax({ transactions: state.data.transactions, accounts: state.data.accounts, fx: state.fx, today: state.today, prices: state.histories });
    const hasTaxable = state.data.accounts.some((a) => isTaxableEachYear(envelopeOf(a.kind)));
    const feeByAccount = tax.accounts
      .filter((a) => a.invested > 0)
      .map((a) => ({ name: state.data.accounts.find((x) => x.id === a.account_id)?.name ?? '—', pct: a.fees / a.invested }))
      .sort((x, y) => y.pct - x.pct);
    const highFees = feeByAccount.filter((a) => a.pct > 0.01);

    return { exposures, vol, mdd, conc, annualized, signals, perPosRisk, alerts, tax, hasTaxable, highFees };
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

          <section className="card">
            <div className="card-title">Plus-values réalisées par année</div>
            {analysis.tax.years.length === 0 ? (
              <p className="muted small">Aucune vente ni dividende pour l'instant.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Année</th>
                      <th className="r">Plus-values nettes</th>
                      {analysis.hasTaxable && <th className="r" title="Comptes-titres uniquement : montant à reporter (formulaire 2074, case 3VG ou 3VH)">dont CTO</th>}
                      <th className="r">Dividendes</th>
                      <th className="r">Frais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.tax.years.map((y) => {
                      const cto = analysis.tax.taxableYears.find((t) => t.year === y.year);
                      return (
                        <tr key={y.year}>
                          <td>{y.year}</td>
                          <td className={`r num ${tone(y.realized)}`}>{signedEur(y.realized)}</td>
                          {analysis.hasTaxable && <td className={`r num ${tone(cto?.realized ?? 0)}`}>{cto ? signedEur(cto.realized) : '—'}</td>}
                          <td className="r num">{eur(y.dividends)}</td>
                          <td className="r num">{eur(y.fees)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {analysis.hasTaxable && <p className="hint">Colonne CTO : à déclarer (2074 · case 3VG si gain, 3VH si perte, reportable 10 ans).</p>}
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
            <div className="card-title">Frais &amp; impôts</div>
            <div className="list">
              <div className="row">
                <div className="row-main">Frais payés</div>
                <span className="num">{eur(analysis.tax.fees)}</span>
              </div>
              <div className="row">
                <div className="row-main" title="Frais de courtage et frais de compte / montant investi">Frais / investi</div>
                <span className={`num ${analysis.tax.feesPct > 0.01 ? 'down' : ''}`}>{pct(analysis.tax.feesPct)}</span>
              </div>
              <div className="row">
                <div className="row-main">Plus-values réalisées {analysis.tax.currentYear}</div>
                <span className={`num ${tone(analysis.tax.realizedThisYear)}`}>{signedEur(analysis.tax.realizedThisYear)}</span>
              </div>
              <div className="row">
                <div className="row-main" title="Flat tax 30 % (12,8 % impôt + 17,2 % prélèvements sociaux) sur plus-values nettes et dividendes du CTO">
                  Impôt estimé {analysis.tax.currentYear}
                </div>
                <span className="num">≈ {eur(analysis.tax.estimatedTax)}</span>
              </div>
            </div>
            {analysis.highFees.length > 0 && (
              <p className="small" style={{ marginBottom: 0 }}>
                <span className="pill warn">Frais élevés</span> {analysis.highFees.map((a) => `${a.name} ${pct(a.pct)}`).join(' · ')}
              </p>
            )}
            <p className="hint" style={{ marginBottom: 0 }}>
              Estimation : flat tax 30 % sur le CTO. PEA/PEE : exonéré tant que vous ne retirez pas (PEA après 5 ans : 17,2 % de prélèvements sociaux au retrait).
            </p>
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
