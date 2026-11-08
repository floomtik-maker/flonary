// Single source of truth for navigation (header, mega-menu, mobile bar, "Plus" page).
import type { ComponentType, SVGProps } from 'react';
import { IconCalendar, IconHome, IconList, IconPie, IconPlus, IconSwap, IconTrend, IconUpload, IconWallet } from '../components/Icons';

export interface NavItem {
  to: string;
  label: string;
  sub: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Route is matched exactly (home) */
  end?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Portefeuille',
    items: [
      { to: '/', label: 'Synthèse', sub: 'Valeur, gain et évolution', icon: IconHome, end: true },
      { to: '/positions', label: 'Positions', sub: 'Vos titres, leur gain et leur risque', icon: IconList },
      { to: '/mouvements', label: 'Mouvements', sub: 'Achats, ventes, dividendes', icon: IconSwap },
    ],
  },
  {
    title: 'Analyser',
    items: [
      { to: '/analyse', label: 'Analyse', sub: 'Exposition et risque', icon: IconPie },
      { to: '/calendrier', label: 'Calendrier', sub: 'Dividendes et résultats à venir', icon: IconCalendar },
      { to: '/projection', label: 'Projection', sub: 'Simuler un investissement mensuel', icon: IconTrend },
    ],
  },
  {
    title: 'Gérer',
    items: [
      { to: '/comptes', label: 'Comptes & connexions', sub: 'Courtiers, sauvegarde', icon: IconWallet },
      { to: '/comptes?import=1', label: 'Importer un fichier', sub: 'CSV Trade Republic, IBKR…', icon: IconUpload },
      { to: '/mouvements?new=1', label: 'Ajouter un mouvement', sub: 'Saisie manuelle', icon: IconPlus },
    ],
  },
];

const ALL = NAV_GROUPS.flatMap((g) => g.items);
const find = (to: string) => ALL.find((i) => i.to === to)!;

/** Short menu shown in the header bar; everything else lives in the mega-menu. */
export const SHORT_MENU: NavItem[] = ['/', '/positions', '/analyse', '/calendrier'].map(find);

/** Mobile bottom bar (the last entry opens the "Plus" page). */
export const MOBILE_BAR: NavItem[] = ['/', '/positions', '/analyse', '/calendrier'].map(find);
