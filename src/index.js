// @ts-check
/**
 * @fob/lgr — the importable ledger client.
 *
 * Construct a client with credentials bound once, then call resource namespaces:
 *
 *   import { fobLgr } from '@finopsbricks/fob-lgr';
 *   const lgr = fobLgr({ api_key, api_secret });   // api_url optional
 *   const { data } = await lgr.transactions.list({ date_from: '2026-04-01' });
 *   const txn = await lgr.transactions.create({ date, entries });
 *
 * The `fob-lgr` CLI builds the same client and calls these same namespaces — so
 * the CLI and the library can never drift: every endpoint is defined once, in
 * src/resources/.
 *
 * Multi-tenant workers construct one client per org: `fobLgr(orgACreds)`,
 * `fobLgr(orgBCreds)`.
 *
 * ## Amounts
 *
 * Integers in minor units everywhere — 150000 is Rs 1,500.00. Nothing here
 * converts decimals, because rounding would silently move money. Convert at
 * your own boundary, deliberately.
 */

import { createTransport } from './http.js';
import { buildAccounts } from './resources/accounts.js';
import { buildTransactions } from './resources/transactions.js';
import { buildEntries } from './resources/entries.js';
import { buildReports } from './resources/reports.js';

export { ApiError, DEFAULT_API_URL, MAX_ALL_ROWS } from './http.js';

/**
 * Build a ledger client with credentials bound.
 *
 * @param {{ api_key: string, api_secret: string, api_url?: string }} [credentials]
 */
export function fobLgr(credentials) {
  const ctx = createTransport(credentials);

  return {
    accounts: buildAccounts(ctx),
    transactions: buildTransactions(ctx),
    entries: buildEntries(ctx),
    reports: buildReports(ctx),
  };
}

export default fobLgr;
