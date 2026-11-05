import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../api';
import { usePortfolio } from '../lib/usePortfolio';
import type { Account, Broker } from '../../shared/types';
import type { UserData } from '../api/backend';
import { Gain, Modal, PageLoading } from '../components/ui';
import { ImportWizard } from '../components/ImportWizard';
import { IconLink, IconPlus, IconRefresh, IconTrash, IconUpload } from '../components/Icons';
import { BROKER_LABELS, date, eur } from '../lib/format';

const KINDS = ['CTO', 'PEA', 'PEE', 'PER', 'AV', 'CRYPTO'];

export function Accounts() {
  const backend = useBackend();
  const { state, loading, error } = usePortfolio();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [importing, setImporting] = useState(params.get('import') === '1');
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => backend.deleteAccount(id),
    onSuccess: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['data'] });
    },
  });

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state) return <PageLoading />;
  const { data } = state;
  const summaries = Object.fromEntries(state.result.accounts.map((a) => [a.account_id, a]));

  return (
    <>
      <div className="page-head">
        <h1>Comptes & connexions</h1>
        <div className="toolbar">
          <button className="btn" disabled={data.accounts.length === 0} onClick={() => setImporting(true)}>
            <IconUpload width={16} height={16} /> Importer un fichier
          </button>
          <button className="btn primary" onClick={() => setEditing({ broker: 'other', kind: 'CTO', name: '' })}>
            <IconPlus width={16} height={16} /> Nouveau compte
          </button>
        </div>
      </div>

      <div className="grid grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-title">Mes comptes</div>
            {data.accounts.length === 0 && (
              <p className="muted">
                Créez un compte par enveloppe (ex. « Interactive Brokers – CTO », « Trade Republic – PEA », « PEE BNP Paribas »), puis ajoutez ou importez vos
                opérations.
              </p>
            )}
            <div className="list">
              {data.accounts.map((a) => {
                const s = summaries[a.id];
                const n = data.transactions.filter((t) => t.account_id === a.id).length;
                return (
                  <div className="row" key={a.id}>
                    <div className="row-main">
                      <div className="row-title">{a.name}</div>
                      <div className="row-sub">
                        {BROKER_LABELS[a.broker]} · {a.kind} · {n} opération(s)
                      </div>
                    </div>
                    {s && (
                      <div className="row-right">
                        <div className="num" style={{ fontWeight: 600 }}>{eur(s.valueEUR)}</div>
                        <div className="small">
                          <Gain value={s.gainEUR} />
                        </div>
                      </div>
                    )}
                    <button className="btn ghost small" onClick={() => setEditing(a)}>
                      Modifier
                    </button>
                    <button className="btn ghost small" aria-label="Supprimer" onClick={() => setDeleting(a)}>
                      <IconTrash width={16} height={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <Connections accounts={data.accounts} />
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-title">Vos courtiers</div>
            <div className="stack small" style={{ gap: 12 }}>
              <div>
                <b>Interactive Brokers</b>
                <div className="muted">Connexion automatique via Flex Web Service (ci-contre), ou import d'un relevé Flex en CSV/XML.</div>
              </div>
              <div>
                <b>Trade Republic</b>
                <div className="muted">
                  Pas d'API officielle. Exportez vos transactions en CSV (outil open source <i>pytr</i>) puis importez le fichier, ou saisissez vos
                  opérations.
                </div>
              </div>
              <div>
                <b>PEE BNP Paribas</b>
                <div className="muted">
                  Les fonds d'épargne salariale ne sont pas cotés : ajoutez vos versements (« Utiliser … comme support manuel ») puis mettez à jour la valeur
                  de la part depuis la fiche du fonds.
                </div>
              </div>
            </div>
          </section>
          <MarketStatus />
          <Backup data={data} />
          {backend.mode === 'live' && (
            <button
              className="btn"
              onClick={async () => {
                await backend.logout();
                qc.clear();
                window.location.reload();
              }}
            >
              Se déconnecter
            </button>
          )}
        </div>
      </div>

      {editing && <AccountForm initial={editing} onClose={() => setEditing(null)} />}
      {importing && (
        <ImportWizard
          accounts={data.accounts}
          instruments={data.instruments}
          onClose={() => {
            setImporting(false);
            if (params.get('import')) {
              params.delete('import');
              setParams(params, { replace: true });
            }
          }}
        />
      )}
      {deleting && (
        <Modal title={`Supprimer « ${deleting.name} » ?`} onClose={() => setDeleting(null)}>
          <p className="muted">Toutes les opérations de ce compte seront supprimées définitivement.</p>
          {del.error && <div className="error">{(del.error as Error).message}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setDeleting(null)}>
              Annuler
            </button>
            <button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={del.isPending} onClick={() => del.mutate(deleting.id)}>
              Supprimer le compte
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AccountForm({ initial, onClose }: { initial: Partial<Account>; onClose: () => void }) {
  const backend = useBackend();
  const qc = useQueryClient();
  const [name, setName] = useState(initial.name ?? '');
  const [broker, setBroker] = useState<Broker>(initial.broker ?? 'other');
  const [kind, setKind] = useState(initial.kind ?? 'CTO');
  const save = useMutation({
    mutationFn: () => backend.saveAccount({ id: initial.id, name: name.trim(), broker, kind }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data'] });
      onClose();
    },
  });
  return (
    <Modal title={initial.id ? 'Modifier le compte' : 'Nouveau compte'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <div className="form-grid">
          <label className="field">
            Courtier / établissement
            <select
              className="input"
              value={broker}
              onChange={(e) => {
                const b = e.target.value as Broker;
                setBroker(b);
                if (!name) setName(BROKER_LABELS[b] === 'Autre' ? '' : BROKER_LABELS[b]);
                if (b === 'bnp_pee') setKind('PEE');
              }}
            >
              {Object.entries(BROKER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Enveloppe
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="field full">
            Nom du compte
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Trade Republic PEA" required autoFocus />
          </label>
        </div>
        {save.error && <div className="error">{(save.error as Error).message}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={save.isPending || !name.trim()}>
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Connections({ accounts }: { accounts: Account[] }) {
  const backend = useBackend();
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ['connections'], queryFn: () => backend.connections() });
  const [adding, setAdding] = useState(false);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.broker === 'ibkr')?.id ?? accounts[0]?.id ?? '');
  const [token, setToken] = useState('');
  const [queryId, setQueryId] = useState('');
  const [msg, setMsg] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () => backend.saveConnection({ account_id: accountId, label: 'Interactive Brokers', token: token.trim(), query_id: queryId.trim() }),
    onSuccess: () => {
      setAdding(false);
      setToken('');
      setQueryId('');
      qc.invalidateQueries({ queryKey: ['connections'] });
    },
  });
  const sync = useMutation({
    mutationFn: (id: string) => backend.syncConnection(id),
    onSuccess: (r, id) => {
      setMsg((m) => ({ ...m, [id]: r.message ?? `${r.imported} importée(s)` }));
      qc.invalidateQueries({ queryKey: ['data'] });
      qc.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: (e, id) => {
      setMsg((m) => ({ ...m, [id]: (e as Error).message }));
      qc.invalidateQueries({ queryKey: ['connections'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => backend.deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '';

  return (
    <section className="card">
      <div className="card-title">
        Connexions automatiques
        {!adding && backend.mode === 'live' && (
          <button className="btn small" disabled={accounts.length === 0} onClick={() => setAdding(true)}>
            <IconLink width={15} height={15} /> Connecter Interactive Brokers
          </button>
        )}
      </div>
      {backend.mode === 'demo' && <p className="muted small">Indisponible en mode démo.</p>}
      {(conns.data ?? []).length === 0 && !adding && backend.mode === 'live' && (
        <p className="muted small" style={{ marginTop: 0 }}>
          Aucune connexion. Interactive Brokers peut être synchronisé automatiquement.
        </p>
      )}
      <div className="list">
        {(conns.data ?? []).map((c) => (
          <div className="row" key={c.id}>
            <div className="row-main">
              <div className="row-title">
                {c.label} → {accName(c.account_id)}
              </div>
              <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                {msg[c.id] ?? (c.last_sync ? `Dernière synchro ${date(c.last_sync.slice(0, 10))} · ${c.last_status ?? ''}` : 'Jamais synchronisé')}
              </div>
            </div>
            <button className="btn small" disabled={sync.isPending} onClick={() => sync.mutate(c.id)}>
              <IconRefresh width={15} height={15} /> {sync.isPending && sync.variables === c.id ? 'Synchro…' : 'Synchroniser'}
            </button>
            <button className="btn ghost small" aria-label="Supprimer" onClick={() => remove.mutate(c.id)}>
              <IconTrash width={16} height={16} />
            </button>
          </div>
        ))}
      </div>
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <ol className="small muted" style={{ paddingLeft: 18 }}>
            <li>Client Portal IBKR → Performance & Rapports → Requêtes Flex → créer une « Activity Flex Query » avec les sections Trades et Cash Transactions, format XML, période « Last 365 days ».</li>
            <li>Dans « Flex Web Service Configuration », activez le service et générez un jeton (token).</li>
            <li>Copiez ici le jeton et l'identifiant (Query ID) de la requête.</li>
          </ol>
          <div className="form-grid">
            <label className="field">
              Compte Flonary
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Query ID
              <input className="input" inputMode="numeric" value={queryId} onChange={(e) => setQueryId(e.target.value)} required />
            </label>
            <label className="field full">
              Jeton Flex Web Service
              <input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
            </label>
          </div>
          <p className="hint">Le jeton est chiffré avant d'être stocké. Il donne un accès en lecture seule à vos relevés.</p>
          {create.error && <div className="error">{(create.error as Error).message}</div>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Annuler
            </button>
            <button className="btn primary" disabled={create.isPending}>
              Enregistrer la connexion
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function MarketStatus() {
  const backend = useBackend();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      if (backend.mode === 'demo') return { providers: ['Simulation (démo)'], calls: null };
      const r = await fetch('/api/health');
      return (await r.json()) as { providers: string[]; calls: { used: number; limit: number; live_quotes: boolean } | null };
    },
    staleTime: 60_000,
  });
  const providers = health.data?.providers ?? [];
  const calls = health.data?.calls;
  return (
    <section className="card">
      <div className="card-title">Source des cours</div>
      {health.isLoading ? (
        <p className="muted small">…</p>
      ) : providers.length ? (
        <>
          <p className="small" style={{ margin: 0 }}>
            <span className="pill up">● Actif</span> {providers.join(', ')} · taux de change BCE
          </p>
          {calls && (
            <p className="hint" style={{ marginBottom: 0 }}>
              {calls.limit <= 100
                ? `Offre gratuite : cours mis à jour chaque soir (${calls.used}/${calls.limit} appels utilisés aujourd'hui). Idéal jusqu'à une quinzaine de titres.`
                : `Cours en temps réel (différé 15 min) · ${calls.used} appels aujourd'hui.`}
            </p>
          )}
        </>
      ) : (
        <div className="warning-box">
          Aucune source de cours configurée : les titres sont valorisés au dernier prix saisi. Ajoutez une clé <b>EODHD_API_KEY</b> (voir docs/MISE-EN-LIGNE.md).
        </div>
      )}
    </section>
  );
}

function Backup({ data }: { data: UserData }) {
  const backend = useBackend();
  const qc = useQueryClient();
  const [pending, setPending] = useState<UserData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const restore = useMutation({
    mutationFn: (d: UserData) => backend.restore(d),
    onSuccess: () => {
      setPending(null);
      qc.invalidateQueries();
    },
  });
  function exportJson() {
    const blob = new Blob([JSON.stringify({ app: 'flonary', version: 1, exported_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flonary-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      const d = JSON.parse(await f.text()) as UserData;
      if (!Array.isArray(d.accounts) || !Array.isArray(d.transactions)) throw new Error('Ce fichier n’est pas une sauvegarde Flonary.');
      setPending({ accounts: d.accounts, transactions: d.transactions, instruments: d.instruments ?? [], manualPrices: d.manualPrices ?? {} });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <section className="card">
      <div className="card-title">Sauvegarde</div>
      <div className="toolbar">
        <button className="btn small" onClick={exportJson}>
          Exporter (JSON)
        </button>
        <label className="btn small">
          Restaurer…
          <input type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </div>
      {err && <div className="error small">{err}</div>}
      {pending && (
        <Modal title="Restaurer la sauvegarde ?" onClose={() => setPending(null)}>
          <p className="muted">
            Vos données actuelles seront remplacées par {pending.accounts.length} compte(s) et {pending.transactions.length} opération(s).
          </p>
          {restore.error && <div className="error">{(restore.error as Error).message}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setPending(null)}>
              Annuler
            </button>
            <button className="btn primary" disabled={restore.isPending} onClick={() => restore.mutate(pending)}>
              Remplacer mes données
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
