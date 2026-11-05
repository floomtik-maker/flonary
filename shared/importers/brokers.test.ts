import { describe, expect, it } from 'vitest';
import { detectBroker, parseBrokerCsv } from './brokers';
import { parseCsv } from './csv';

// Anonymised samples. Degiro: structure of real exports; others: assumed formats (see brokers.ts).
const DEGIRO_TX_FR = `Date,Heure,Produit,Code ISIN,Place boursiere,Lieu d'exécution,Quantité,Cours,,Valeur locale,,Valeur,,Taux de change,Frais de courtage,,Montant négocié,,ID Ordre
14-03-2025,15:42,APPLE INC - COMMON ST,US0378331005,NDQ,XNAS,10,"210,50",USD,"-2105,00",USD,"-1940,09",EUR,"1,0850","-2,00",EUR,"-1942,09",EUR,aaaa-1111
02-06-2025,09:05,LVMH,FR0000121014,EPA,XPAR,-2,"700,00",EUR,"1400,00",EUR,"1400,00",EUR,,"-4,90",EUR,"1395,10",EUR,bbbb-2222
`;

const DEGIRO_TX_EN = `Date,Time,Product,ISIN,Reference exchange,Venue,Quantity,Price,,Local value,,Value EUR,Exchange rate,AutoFX Fee,Transaction and/or third party fees EUR,Total EUR,Order ID,
05-01-2026,10:00,ISHARES CORE MSCI WORLD,IE00B4L5Y983,EAM,XAMS,3,101.20,EUR,-303.60,EUR,-303.60,,0.00,-1.00,-304.60,cccc-3333,
`;

const DEGIRO_ACCOUNT_FR = `Date,Heure,Date de valeur,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre
13-03-2025,10:00,13-03-2025,,,Dépôt flatex,,EUR,"2000,00",EUR,"2000,00",
14-03-2025,15:42,14-03-2025,APPLE INC - COMMON ST,US0378331005,"Achat 10 Apple@210,5 USD",,USD,"-2105,00",USD,"-2105,00",aaaa-1111
15-05-2025,07:30,14-05-2025,APPLE INC - COMMON ST,US0378331005,Dividende,,USD,"2,50",USD,"2,50",
15-05-2025,07:30,14-05-2025,APPLE INC - COMMON ST,US0378331005,Impôts sur dividende,,USD,"-0,38",USD,"2,12",
01-01-2026,08:00,31-12-2025,,,Frais de connexion à la place boursière 2026 (Euronext Paris - EPA),,EUR,"-2,50",EUR,"1997,50",
`;

const TR = `date,type,name,isin,shares,price,amount,fee,tax,currency,transaction_id
2026-04-20,Buy,iShares Core MSCI World,IE00B4L5Y983,"2,5",100,-250,-1,0,EUR,tr-1
2026-04-22,Dividend,Apple,US0378331005,,,"3,10",0,"0,47",EUR,tr-2
2026-04-01,Deposit,,,,,500,0,0,EUR,tr-3
`;

const BOURSO = `Date opération;Date valeur;Opération;Valeur;Code ISIN;Quantité;Cours;Frais;Montant net;Devise
03/02/2025;05/02/2025;ACHAT COMPTANT;TOTALENERGIES SE;FR0000120271;20;58,40;1,99;-1 169,99;EUR
10/07/2025;10/07/2025;COUPONS;TOTALENERGIES SE;FR0000120271;20;;;15,80;EUR
`;

const FORTUNEO = `libellé;Opération;Place;Date;Qté;Prix d'exé;Montant brut;Courtage;Montant net;Devise
AIR LIQUIDE;Achat Comptant;EURONEXT;12/03/2025;5;170,00;850,00;1,95;851,95;EUR
AIR LIQUIDE;Vente Comptant;EURONEXT;12/09/2025;-2;180,00;360,00;0,99;359,01;EUR
`;

const rowsOf = (csv: string) => parseCsv(csv);

describe('broker CSV detection', () => {
  it('recognises each format from its header', () => {
    expect(detectBroker(rowsOf(DEGIRO_TX_FR)[0])).toBe('degiro_transactions');
    expect(detectBroker(rowsOf(DEGIRO_TX_EN)[0])).toBe('degiro_transactions');
    expect(detectBroker(rowsOf(DEGIRO_ACCOUNT_FR)[0])).toBe('degiro_account');
    expect(detectBroker(rowsOf(TR)[0])).toBe('trade_republic');
    expect(detectBroker(rowsOf(BOURSO)[0])).toBe('boursorama');
    expect(detectBroker(rowsOf(FORTUNEO)[0])).toBe('fortuneo');
    expect(detectBroker(['Date', 'Ticker', 'Quantité', 'Prix'])).toBeNull();
  });
});

describe('Degiro', () => {
  it('parses Transactions.csv (FR), fees converted to instrument currency', () => {
    const [buy, sell] = parseBrokerCsv(rowsOf(DEGIRO_TX_FR), 'degiro_transactions');
    expect(buy.error).toBeUndefined();
    expect(buy.isin).toBe('US0378331005');
    expect(buy.tx).toMatchObject({ date: '2025-03-14', type: 'BUY', symbol: 'isin:US0378331005', quantity: 10, price: 210.5, currency: 'USD' });
    expect(buy.tx!.fees).toBeCloseTo(2.17, 2); // 2 EUR × 1.085
    expect(buy.tx!.fx_rate).toBeCloseTo(1 / 1.085, 6);
    expect(sell.tx).toMatchObject({ date: '2025-06-02', type: 'SELL', quantity: 2, price: 700, fees: 4.9, currency: 'EUR', fx_rate: 1 });
    expect(buy.tx!.external_id).not.toBe(sell.tx!.external_id);
  });
  it('parses Transactions.csv (EN, newer columns)', () => {
    const [r] = parseBrokerCsv(rowsOf(DEGIRO_TX_EN), 'degiro_transactions');
    expect(r.tx).toMatchObject({ type: 'BUY', quantity: 3, price: 101.2, fees: 1, currency: 'EUR', symbol: 'isin:IE00B4L5Y983' });
  });
  it('parses Account.csv cash movements and skips trades', () => {
    const res = parseBrokerCsv(rowsOf(DEGIRO_ACCOUNT_FR), 'degiro_account');
    expect(res[0].tx).toMatchObject({ type: 'DEPOSIT', amount: 2000, currency: 'EUR', symbol: null });
    expect(res[1].tx).toBeNull();
    expect(res[1].error).toContain('ignoré');
    expect(res[2].tx).toMatchObject({ type: 'DIVIDEND', amount: 2.5, currency: 'USD', symbol: 'isin:US0378331005' });
    expect(res[3].tx).toMatchObject({ type: 'DIVIDEND', amount: -0.38 });
    expect(res[4].tx).toMatchObject({ type: 'FEE', amount: 2.5, date: '2026-01-01' });
    expect(res[2].tx!.external_id).not.toBe(res[3].tx!.external_id);
  });
});

describe('other brokers (assumed formats)', () => {
  it('Trade Republic', () => {
    const [buy, div, dep] = parseBrokerCsv(rowsOf(TR), 'trade_republic');
    expect(buy.tx).toMatchObject({ type: 'BUY', quantity: 2.5, price: 100, fees: 1, symbol: 'isin:IE00B4L5Y983', external_id: 'trade_republic:tr-1' });
    expect(div.tx).toMatchObject({ type: 'DIVIDEND', amount: 2.63, symbol: 'isin:US0378331005' });
    expect(dep.tx).toMatchObject({ type: 'DEPOSIT', amount: 500, symbol: null });
  });
  it('Boursorama', () => {
    const [buy, div] = parseBrokerCsv(rowsOf(BOURSO), 'boursorama');
    expect(buy.tx).toMatchObject({ date: '2025-02-03', type: 'BUY', quantity: 20, price: 58.4, fees: 1.99, symbol: 'isin:FR0000120271' });
    expect(buy.name).toBe('TOTALENERGIES SE');
    expect(div.tx).toMatchObject({ type: 'DIVIDEND', amount: 15.8 });
  });
  it('Fortuneo (no ISIN column → name only, flagged)', () => {
    const [buy] = parseBrokerCsv(rowsOf(FORTUNEO), 'fortuneo');
    expect(buy.tx).toBeNull();
    expect(buy.error).toContain('ISIN');
    expect(buy.name).toBeUndefined();
  });
});
