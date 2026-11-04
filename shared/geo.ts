/** Country / sector helpers (French labels used in the UI). */

const SUFFIX_COUNTRY: Record<string, string> = {
  PA: 'France',
  AS: 'Pays-Bas',
  BR: 'Belgique',
  LS: 'Portugal',
  DE: 'Allemagne',
  F: 'Allemagne',
  L: 'Royaume-Uni',
  MI: 'Italie',
  MC: 'Espagne',
  SW: 'Suisse',
  TO: 'Canada',
  HK: 'Hong Kong',
  T: 'Japon',
  ST: 'Suède',
  CO: 'Danemark',
  HE: 'Finlande',
  OL: 'Norvège',
  IR: 'Irlande',
  VI: 'Autriche',
};

const EN_COUNTRY: Record<string, string> = {
  USA: 'États-Unis',
  'United States': 'États-Unis',
  US: 'États-Unis',
  France: 'France',
  FR: 'France',
  Netherlands: 'Pays-Bas',
  NL: 'Pays-Bas',
  Germany: 'Allemagne',
  DE: 'Allemagne',
  'United Kingdom': 'Royaume-Uni',
  UK: 'Royaume-Uni',
  GB: 'Royaume-Uni',
  Switzerland: 'Suisse',
  CH: 'Suisse',
  Italy: 'Italie',
  Spain: 'Espagne',
  Belgium: 'Belgique',
  Ireland: 'Irlande',
  Canada: 'Canada',
  Japan: 'Japon',
  China: 'Chine',
  Taiwan: 'Taïwan',
  Denmark: 'Danemark',
  Sweden: 'Suède',
  Luxembourg: 'Luxembourg',
};

const EN_SECTOR: Record<string, string> = {
  Technology: 'Technologie',
  'Information Technology': 'Technologie',
  Healthcare: 'Santé',
  'Health Care': 'Santé',
  'Financial Services': 'Finance',
  Financials: 'Finance',
  'Consumer Cyclical': 'Consommation cyclique',
  'Consumer Discretionary': 'Consommation cyclique',
  'Consumer Defensive': 'Consommation de base',
  'Consumer Staples': 'Consommation de base',
  Energy: 'Énergie',
  Industrials: 'Industrie',
  'Basic Materials': 'Matériaux',
  Materials: 'Matériaux',
  Utilities: 'Services publics',
  'Real Estate': 'Immobilier',
  'Communication Services': 'Communication',
};

export function countryFr(name: string | null | undefined): string | null {
  if (!name) return null;
  return EN_COUNTRY[name] ?? name;
}

export function sectorFr(name: string | null | undefined): string | null {
  if (!name) return null;
  return EN_SECTOR[name] ?? name;
}

/** Best-effort guess from the ticker suffix and the name (ETFs → their main zone). */
export function guessCountry(symbol: string, name = '', isEtf = false): string | null {
  const n = name.toLowerCase();
  if (isEtf || /\b(etf|ucits|fcpe|fund|fonds|sicav)\b/.test(n)) {
    if (/world|monde|acwi|global/.test(n)) return 'Monde';
    if (/s&p|s\&p|nasdaq|usa|u\.s\.|us equity|dow jones/.test(n)) return 'États-Unis';
    if (/emerging|émergent|emergent/.test(n)) return 'Émergents';
    if (/europe|stoxx|euro/.test(n)) return 'Europe';
    if (/cac|france/.test(n)) return 'France';
    if (/japan|japon|topix|nikkei/.test(n)) return 'Japon';
    if (/china|chine/.test(n)) return 'Chine';
    return null;
  }
  if (symbol.startsWith('manual:')) return null;
  const m = /\.([A-Z]+)$/.exec(symbol);
  if (!m) return /-USD$|-EUR$/.test(symbol) ? null : 'États-Unis';
  return SUFFIX_COUNTRY[m[1]] ?? null;
}

/** Region grouping for the exposure chart. */
export function regionOf(country: string | null | undefined): string {
  if (!country) return 'Non renseigné';
  const europe = ['France', 'Pays-Bas', 'Belgique', 'Portugal', 'Allemagne', 'Royaume-Uni', 'Italie', 'Espagne', 'Suisse', 'Suède', 'Danemark', 'Finlande', 'Norvège', 'Irlande', 'Autriche', 'Luxembourg', 'Europe'];
  if (country === 'États-Unis' || country === 'Canada') return 'Amérique du Nord';
  if (europe.includes(country)) return 'Europe';
  if (['Japon', 'Chine', 'Hong Kong', 'Taïwan', 'Corée du Sud', 'Inde', 'Australie'].includes(country)) return 'Asie-Pacifique';
  if (country === 'Émergents') return 'Émergents';
  if (country === 'Monde') return 'Monde (diversifié)';
  return 'Autres';
}
