/**
 * Interactive Brokers Flex Web Service connector.
 * The user creates a Flex Query (Trades + Cash Transactions, format XML) and a Flex Web
 * Service token in the IBKR Client Portal, then pastes the token + query id in Flonary.
 */
import { parseIbkrFlexXml, type ParsedImport } from '../../shared/importers/ibkr';

const BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].trim() : null;
}

export async function fetchFlexStatement(token: string, queryId: string, opts: { attempts?: number; waitMs?: number } = {}): Promise<string> {
  const { attempts = 6, waitMs = 3000 } = opts;
  const send = await fetch(`${BASE}/SendRequest?${new URLSearchParams({ t: token, q: queryId, v: '3' })}`);
  const sendXml = await send.text();
  if (tag(sendXml, 'Status') !== 'Success') {
    throw new Error(`IBKR : ${tag(sendXml, 'ErrorMessage') ?? 'demande refusée'} (code ${tag(sendXml, 'ErrorCode') ?? send.status})`);
  }
  const ref = tag(sendXml, 'ReferenceCode')!;
  const url = tag(sendXml, 'Url') ?? `${BASE}/GetStatement`;
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, waitMs));
    const res = await fetch(`${url}?${new URLSearchParams({ q: ref, t: token, v: '3' })}`);
    const xml = await res.text();
    if (xml.includes('<FlexQueryResponse')) return xml;
    const code = tag(xml, 'ErrorCode');
    // 1019 = statement generation in progress; 1018 = too many requests
    if (code === '1019' || code === '1018') continue;
    throw new Error(`IBKR : ${tag(xml, 'ErrorMessage') ?? 'relevé indisponible'} (code ${code ?? res.status})`);
  }
  throw new Error("IBKR : le relevé n'est pas encore prêt, réessayez dans une minute.");
}

export async function syncIbkr(token: string, queryId: string): Promise<ParsedImport> {
  const xml = await fetchFlexStatement(token, queryId);
  return parseIbkrFlexXml(xml);
}
