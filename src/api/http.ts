import type { Backend } from './backend';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error ?? `Erreur ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return json as T;
}

const q = (o: Record<string, string>) => '?' + new URLSearchParams(o).toString();

export const httpBackend: Backend = {
  mode: 'live',
  me: async () => {
    try {
      return await call('GET', '/auth/me');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  login: (email, password) => call('POST', '/auth/login', { email, password }),
  register: (email, password) => call('POST', '/auth/register', { email, password }),
  logout: () => call('POST', '/auth/logout'),

  getData: () => call('GET', '/data'),
  saveAccount: (a) => call('POST', '/accounts', a),
  deleteAccount: (id) => call('DELETE', `/accounts/${encodeURIComponent(id)}`),
  saveTransactions: (txs) => call('POST', '/transactions', { transactions: txs }),
  deleteTransaction: (id) => call('DELETE', `/transactions/${encodeURIComponent(id)}`),
  saveInstrument: (i) => call('PUT', `/instruments`, i),
  saveManualPrice: (symbol, date, price) => call('POST', '/manual-prices', { symbol, date, price }),
  deleteManualPrice: (symbol, date) => call('DELETE', '/manual-prices' + q({ symbol, date })),
  restore: (data) => call('POST', '/restore', data),

  history: (symbols, from) => (symbols.length ? call('GET', '/market/history' + q({ symbols: symbols.join(','), from })) : Promise.resolve({})),
  quotes: (symbols) => (symbols.length ? call('GET', '/market/quotes' + q({ symbols: symbols.join(',') })) : Promise.resolve({})),
  fx: (currencies, from) =>
    currencies.length ? call('GET', '/market/fx' + q({ currencies: currencies.join(','), from })) : Promise.resolve({}),
  search: (query) => call('GET', '/market/search' + q({ q: query })),
  profile: (symbol) => call('GET', '/market/profile' + q({ symbol })),

  connections: () => call('GET', '/connections'),
  saveConnection: (c) => call('POST', '/connections', c),
  deleteConnection: (id) => call('DELETE', `/connections/${encodeURIComponent(id)}`),
  syncConnection: (id) => call('POST', `/connections/${encodeURIComponent(id)}/sync`),
};
