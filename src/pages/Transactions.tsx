import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../api';
import { useUserData } from '../lib/usePortfolio';
import { TransactionForm } from '../components/TransactionForm';
import { Empty, Modal, PageLoading } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { IconPlus, IconTrash, IconUpload } from '../components/Icons';
import { TX_LABELS, date, money, qty } from '../lib/format';
import type { Transaction } from '../../shared/types';

const PAGE = 100;

export function Transactions() {
  const backend = useBackend();
  const qc = useQueryClient();
  const { data, isLoading, error } = useUserData();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Transaction | 'new' | null>(params.get('new') ? 'new' : null);
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);
  const [account, setAccount] = useState('');
  const [type, setType] = useState('');
  const [text, setText] = useState(params.get('symbol') ?? '');
  const [limit, setLimit] = useState(PAGE);

  const del = useMutation({
    mutationFn: (id: string) => backend.deleteTransaction(id),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['data'] });
    },
  });

  const names = useMemo(() => Object.fromEntries((data?.instruments ?? []).map((i) => [i.symbol, i.name])), [data]);
  const accNames = useMemo(() => Object.fromEntries((data?.accounts ?? []).map((a) => [a.id, a.name])), [data]);
  const list = useMemo(() => {
    const s = text.trim().toLowerCase();
    return [...(data?.transactions ?? [])]
      .filter((t) => (!account || t.account_id === account) && (!type || t.type === type))
      .filter((t) => !s || (t.symbol ?? '').toLowerCase().includes(s) || (names[t.symbol ?? ''] ?? '').toLowerCase().includes(s) || (t.note ?? '').toLowerCase().includes(s))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [data, account, type, text, names]);

  if (error) return <div className="card error">{(error as Error).message}</div>;
  if (isLoading || !data) return <PageLoading />;

  const close = () => {
    setEditing(null);
    if (params.get('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        title="Mouvements"
        search={{ value: text, onChange: setText, placeholder: 'Rechercher un titre…' }}
        actions={
          <>
            <Link className="btn" to="/comptes?import=1">
              <IconUpload width={16} height={16} /> Importer
            </Link>
            <button className="btn primary" onClick={() => setEditing('new')}>
              <IconPlus width={16} height={16} /> Ajouter
            </button>
          </>
        }
      />

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <select className="input" style={{ maxWidth: 200 }} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">Tous les comptes</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="input" style={{ maxWidth: 170 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(TX_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="muted small">{list.length} opération(s)</span>
      </div>

      <section className="card" style={{ padding: 8 }}>
        {list.length === 0 ? (
          <Empty title="Aucune opération">
            <p>Ajoutez vos achats, ventes et dividendes, ou importez un fichier de votre courtier.</p>
          </Empty>
        ) : (
          <div className="list" style={{ padding: '0 8px' }}>
            {list.slice(0, limit).map((t) => {
              const trade = t.type === 'BUY' || t.type === 'SELL';
              const value = trade ? t.quantity * t.price : t.amount;
              const sign = t.type === 'SELL' || t.type === 'DIVIDEND' || t.type === 'DEPOSIT' ? '+' : '−';
              return (
                <div className="row" key={t.id}>
                  <div style={{ width: 92 }} className="small muted num hide-mobile">
                    {date(t.date)}
                  </div>
                  <span className="chip hide-mobile" style={{ width: 82, textAlign: 'center' }}>
                    {TX_LABELS[t.type]}
                  </span>
                  <button className="row-main btn ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', padding: 0, border: 0, fontWeight: 400 }} onClick={() => setEditing(t)}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row-title">{t.symbol ? (names[t.symbol] ?? t.symbol) : TX_LABELS[t.type]}</div>
                      <div className="row-sub">
                        <span className="show-mobile-inline">
                          {TX_LABELS[t.type]} · {date(t.date)} ·{' '}
                        </span>
                        {accNames[t.account_id] ?? ''}
                        {trade ? ` · ${qty(t.quantity)} × ${money(t.price, t.currency)}` : ''}
                        {t.note ? ` · ${t.note}` : ''}
                      </div>
                    </div>
                  </button>
                  <div className="row-right num" style={{ fontWeight: 600 }}>
                    {sign}
                    {money(Math.abs(value), t.currency)}
                  </div>
                  <button className="btn ghost small" aria-label="Supprimer" onClick={() => setConfirmDelete(t)}>
                    <IconTrash width={16} height={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {list.length > limit && (
          <div style={{ textAlign: 'center', padding: 10 }}>
            <button className="btn small" onClick={() => setLimit(limit + PAGE)}>
              Afficher plus
            </button>
          </div>
        )}
      </section>

      {editing && (
        <TransactionForm accounts={data.accounts} instruments={data.instruments} initial={editing === 'new' ? undefined : editing} onClose={close} />
      )}
      {confirmDelete && (
        <Modal title="Supprimer cette opération ?" onClose={() => setConfirmDelete(null)}>
          <p className="muted">
            {TX_LABELS[confirmDelete.type]} du {date(confirmDelete.date)} {confirmDelete.symbol ? `— ${names[confirmDelete.symbol] ?? confirmDelete.symbol}` : ''}. La performance sera recalculée.
          </p>
          {del.error && <div className="error">{(del.error as Error).message}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirmDelete(null)}>
              Annuler
            </button>
            <button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={del.isPending} onClick={() => del.mutate(confirmDelete.id)}>
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
