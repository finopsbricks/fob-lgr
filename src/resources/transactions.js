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

    /**
     * Edit a draft. `entries` is replaced wholesale, not merged. `type` sent on
     * its own is accepted in any status (see `setType`).
     */
    update: (id, data) => ctx.patch(`/api/v1/transactions/${encodeURIComponent(id)}`, data).then(unwrap),

    /** Post a draft. The balance check runs here and refuses if it fails. */
    post: (id) => ctx.patch(`/api/v1/transactions/${encodeURIComponent(id)}`, { status: 'posted' }).then(unwrap),

    /**
     * Void a transaction. The only way to reverse a posted one — it stays in
     * the ledger, excluded from reports but visible as having happened.
     */
    void: (id) => ctx.patch(`/api/v1/transactions/${encodeURIComponent(id)}`, { status: 'void' }).then(unwrap),

    /**
     * Change the business event type, in any status. The one field a posted
     * transaction may change: it moves no balance.
     */
    setType: (id, type) => ctx.patch(`/api/v1/transactions/${encodeURIComponent(id)}`, { type }).then(unwrap),

    /**
     * Delete a transaction. A draft always; a posted or void one only while
     * the org has Allow hard delete on, otherwise it is voided instead.
     */
    delete: (id) => ctx.delete(`/api/v1/transactions/${encodeURIComponent(id)}`).then(unwrap),

    /**
     * Delete every transaction from one source (`{ source, date_from?, date_to? }`),
     * only while the org has Allow hard delete on. Returns `{ matched, deleted, dry_run }`.
     * It can't be undone: call `countForDelete` first to see what it would remove.
     */
    deleteMany: (filter) => ctx.delete('/api/v1/transactions', { searchParams: filter }).then(unwrap),

    /** How many transactions `deleteMany(filter)` would delete, without deleting any. */
    countForDelete: (filter) => ctx.delete('/api/v1/transactions', { searchParams: { ...filter, dry_run: true } }).then(unwrap),
  };
}
