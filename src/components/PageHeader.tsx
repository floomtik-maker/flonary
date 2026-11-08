import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconSearch } from './Icons';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageSearch {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/** Breadcrumb + page title, with an optional search field and action buttons on the right. */
export function PageHeader({ title, crumbs = [], search, actions }: { title: string; crumbs?: Crumb[]; search?: PageSearch; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <nav className="breadcrumb" aria-label="Fil d'Ariane">
        <Link to="/">Accueil</Link>
        {crumbs.map((c) => (
          <span key={c.label} className="crumb">
            <span className="sep" aria-hidden>
              ›
            </span>
            {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
          </span>
        ))}
        <span className="crumb">
          <span className="sep" aria-hidden>
            ›
          </span>
          <span aria-current="page">{title}</span>
        </span>
      </nav>
      <div className="page-title-row">
        <h1>{title}</h1>
        <div className="page-tools">
          {search && (
            <label className="search-field">
              <IconSearch width={16} height={16} />
              <input
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? 'Rechercher'}
                aria-label={search.placeholder ?? 'Rechercher'}
              />
            </label>
          )}
          {actions}
        </div>
      </div>
    </header>
  );
}
