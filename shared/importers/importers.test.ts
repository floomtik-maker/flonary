import { describe, expect, it } from 'vitest';
import { parseIbkrFlexXml, ibkrSymbol } from './ibkr';
import { detectMapping, looksLikeIbkr, parseCsv, parseDate, parseIbkrCsv, parseNumber, rowsToTransactions } from './csv';

const FLEX = `<FlexQueryResponse queryName="flonary" type="AF"><FlexStatements count="1"><FlexStatement accountId="U123">
<Trades>
<Trade accountId="U123" currency="USD" assetCategory="STK" symbol="AAPL" description="APPLE INC" isin="US0378331005" listingExchange="NASDAQ" tradeID="111" tradeDate="20250102" quantity="10" tradePrice="185.5" ibCommission="-1" buySell="BUY" levelOfDetail="EXECUTION" />
<Trade accountId="U123" currency="EUR" assetCategory="STK" symbol="MC" description="LVMH MOET HENNESSY" listingExchange="SBF" tradeID="112" tradeDate="2025-03-05" quantity="-2" tradePrice="700" ibCommission="-3" buySell="SELL" />
<Trade accountId="U123" currency="USD" assetCategory="OPT" symbol="AAPL 250117C00200000" tradeID="113" tradeDate="20250103" quantity="1" tradePrice="2" buySell="BUY" />
</Trades>
<CashTransactions>
<CashTransaction currency="USD" symbol="AAPL" listingExchange="NASDAQ" dateTime="20250213;202000" amount="2.5" type="Dividends" transactionID="900" description="AAPL CASH DIVIDEND" />
<CashTransaction currency="USD" symbol="AAPL" dateTime="20250213" amount="-0.38" type="Withholding Tax" transactionID="901" />
<CashTransaction currency="EUR" dateTime="20250101" amount="5000" type="Deposits/Withdrawals" transactionID="902" />
</CashTransactions>
</FlexStatement></FlexStatements></FlexQueryResponse>`;

describe('IBKR Flex', () => {
  it('maps symbols', () => {
    expect(ibkrSymbol('MC', 'SBF')).toBe('MC.PA');
    expect(ibkrSymbol('ASML', 'AEB')).toBe('ASML.AS');
    expect(ibkrSymbol('BRK B', 'NYSE')).toBe('BRK-B');
  });
  it('parses trades and cash transactions', () => {
    const r = parseIbkrFlexXml(FLEX);
    const t = r.transactions;
    expect(t.filter((x) => x.type === 'BUY')).toHaveLength(1);
    const sell = t.find((x) => x.type === 'SELL')!;
    expect(sell).toMatchObject({ symbol: 'MC.PA', quantity: 2, price: 700, fees: 3, date: '2025-03-05', currency: 'EUR', external_id: 'ibkr:t:112' });
    expect(t.filter((x) => x.type === 'DIVIDEND').map((x) => x.amount)).toEqual([2.5, -0.38]);
    expect(t.find((x) => x.type === 'DEPOSIT')!.amount).toBe(5000);
    expect(r.warnings[0]).toContain('OPT');
    expect(r.names['AAPL'].name).toBe('APPLE INC');
  });
});

describe('CSV', () => {
  it('parses quoted CSV with ; delimiter', () => {
    const rows = parseCsv('Date;Nom;"Prix"\n02/01/2025;"Air ""Liquide""";1 234,5\n');
    expect(rows).toEqual([
      ['Date', 'Nom', 'Prix'],
      ['02/01/2025', 'Air "Liquide"', '1 234,5'],
    ]);
  });
  it('numbers and dates', () => {
    expect(parseNumber('1 234,56 €')).toBeCloseTo(1234.56);
    expect(parseNumber('1,234.56')).toBeCloseTo(1234.56);
    expect(parseNumber('-12,5')).toBe(-12.5);
    expect(parseDate('02/01/2025')).toBe('2025-01-02');
    expect(parseDate('2025-01-02T10:00')).toBe('2025-01-02');
  });
  it('Trade Republic (pytr) export', () => {
    const csv = 'Date;Type;Value;Note;ISIN;Shares;Fees;Taxes\n2025-01-02;Buy;-500,00;MSCI World;IE00B4L5Y983;5,5;-1,00;\n2025-02-01;Dividend;3,20;Total;FR0000120271;;;\n2025-02-05;Deposit;1000;;;;;';
    const rows = parseCsv(csv);
    const map = detectMapping(rows[0]);
    const out = rowsToTransactions(rows.slice(1), map);
    expect(out.every((o) => o.tx)).toBe(true);
    expect(out[0].tx).toMatchObject({ type: 'BUY', quantity: 5.5, fees: 1, symbol: 'isin:IE00B4L5Y983' });
    expect(out[0].tx!.price).toBeCloseTo(500 / 5.5);
    expect(out[1].tx).toMatchObject({ type: 'DIVIDEND', amount: 3.2 });
    expect(out[2].tx).toMatchObject({ type: 'DEPOSIT', amount: 1000 });
  });
  it('IBKR Flex CSV', () => {
    const csv = '"Symbol","ListingExchange","CurrencyPrimary","TradeDate","Quantity","TradePrice","IBCommission","Buy/Sell","TradeID","Description","AssetClass"\n"MC","SBF","EUR","20250305","3","700","-3","BUY","5","LVMH","STK"';
    const rows = parseCsv(csv);
    expect(looksLikeIbkr(rows[0])).toBe(true);
    const r = parseIbkrCsv(rows);
    expect(r.transactions[0]).toMatchObject({ symbol: 'MC.PA', quantity: 3, price: 700, fees: 3, type: 'BUY' });
  });
  it('reports bad rows', () => {
    const rows = parseCsv('date,type,symbol,quantity,price\nxx,buy,AAPL,1,1\n2025-01-01,???,AAPL,1,1\n2025-01-01,buy,AAPL,,1');
    const out = rowsToTransactions(rows.slice(1), detectMapping(rows[0]));
    expect(out.map((o) => o.error)).toEqual(['date illisible', 'type inconnu « ??? »', 'quantité ou prix manquant']);
  });
});
