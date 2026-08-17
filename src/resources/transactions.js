// @ts-check
/**
 * The `transactions` resource — every transaction endpoint, defined once.
 *
 * Amounts throughout are integers in minor units: 150000 is Rs 1,500.00. The
 * client does no conversion in either direction, deliberately. A helper that
 * accepted decimals would have to round, and rounding here would silently move
 * money between what a caller meant and what the ledger stored.
 */

const unwrap = (r) => r?.data ?? null;

export function buildTransactions(ctx) {
  return {
    /** One page of transactions, entries included unless `include_entries=false`. */
    list: (params = {}) => ctx.get('/api/v1/transactions', { searchParams: params }),

    /** Every matching transaction, walking pagination. Capped at MAX_ALL_ROWS. */
    getAll: async (params = {}) => (await ctx.getAll('/api/v1/transactions', { searchParams: params })).data,

    /** One transaction with its entries and Dr/Cr totals. */
    get: (id) => ctx.get(`/api/v1/transactions/${encodeURIComponent(id)}`).then(unwrap),

    /**
     * Create a transaction and its entries atomically.
     *
     * Idempotent on `(source, source_ref)`: re-sending one already imported
     * returns the existing transaction with `created: false` instead of
     * duplicating it. That is what makes an interrupted sync safe to re-run.
     */
    create: (data) => ctx.post('/api/v1/transactions', data).then(unwrap),

    /** Edit a draft. `entries` is replaced wholesale, not merged. */
    update: (id, data) => ctx.patch(`/api/v1/transactions/${encodeURIComponent(id)}`, data).then(unwrap),

    /** Post a draft. The balance check runs here and refuses if it fails. */
    post: (id) => ctx.patch(`/api/v1/transactions/${encodeURIComponent(id)}`, { status: 'posted' }).then(unwrap),

    /**
     * Void a transaction. The only way to reverse a posted one — it stays in
     * the ledger, excluded from reports but visible as having happened.
     */
    void: (id) => ctx.patch(`/api/v1/transactions/${encodeURIComponent(id)}`, { status: 'void' }).then(unwrap),

    /** Delete a draft. Posted transactions are voided, never deleted. */
    delete: (id) => ctx.delete(`/api/v1/transactions/${encodeURIComponent(id)}`).then(unwrap),
  };
}
