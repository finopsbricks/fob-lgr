// @ts-check
/**
 * The `reports` resource — read-only views over posted transactions.
 */

const unwrap = (r) => r?.data ?? null;

export function buildReports(ctx) {
  return {
    /**
     * Every account's balance as at a date (`{ as_of: 'YYYY-MM-DD', 'dimension.<key>'?: value }`),
     * posted transactions only. Returns `{ as_of, rows, total_debit, total_credit }`; each row
     * carries the account's `source` and `source_ref` and its balance on the side it falls.
     * An account with no posted entries has no row: treat it as zero.
     */
    trialBalance: (params) => ctx.get('/api/v1/reports/trial-balance', { searchParams: params }).then(unwrap),
  };
}
