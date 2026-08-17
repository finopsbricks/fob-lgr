// @ts-check
/**
 * The `entries` resource — read-only.
 *
 * There is no create, update or delete. Entries exist only as part of a
 * transaction, because an entry writable on its own could leave one unbalanced.
 * Use `transactions.create` or `transactions.update`.
 */

export function buildEntries(ctx) {
  return {
    /**
     * One page of entries, each carrying its parent transaction's date,
     * narration and status alongside its own amounts.
     *
     * Defaults to posted transactions only — an entry on a draft is not part of
     * the books. Pass `status: 'all'` to include them.
     */
    list: (params = {}) => ctx.get('/api/v1/entries', { searchParams: params }),

    /** Every matching entry, walking pagination. Capped at MAX_ALL_ROWS. */
    getAll: async (params = {}) => (await ctx.getAll('/api/v1/entries', { searchParams: params })).data,

    /**
     * Every entry with no dimensions at all — the unallocated ones.
     *
     * Worth running before trusting any dimension-filtered total, since these
     * are exactly what such a report leaves out.
     */
    unallocated: (params = {}) =>
      ctx.get('/api/v1/entries', { searchParams: { ...params, has_dimension: 'false' } }),
  };
}
