// @ts-check
/**
 * The `accounts` resource — every account endpoint, defined once.
 *
 * `buildAccounts(ctx)` binds a credential-carrying transport into a namespace of
 * methods. This is what `fobLgr(creds).accounts` is, and the single place
 * account paths live — CLI handlers call these and hold no paths of their own,
 * so the library and the CLI cannot drift.
 *
 * Return shapes: single-record ops return the unwrapped record; `list` returns
 * the raw `{ data, page_context }` envelope; `getAll` returns a flat array.
 */

/** Unwrap a single-record response body; null if there's no data. */
const unwrap = (r) => r?.data ?? null;

export function buildAccounts(ctx) {
  return {
    /** One page of accounts. Returns the `{ data, page_context }` envelope. */
    list: (params = {}) => ctx.get('/api/v1/accounts', { searchParams: params }),

    /** Every matching account, walking pagination. Flat array, capped at MAX_ALL_ROWS. */
    getAll: async (params = {}) => (await ctx.getAll('/api/v1/accounts', { searchParams: params })).data,

    /** One account by id, or null if absent. */
    get: (id) => ctx.get(`/api/v1/accounts/${encodeURIComponent(id)}`).then(unwrap),

    /**
     * The whole chart of accounts, nested. Unpaginated by design — a partial
     * tree is not a tree.
     *
     * Returns `{ accounts, total, account_types }`, the last being the type →
     * normal balance / statement map, so a caller never has to reconstruct it.
     */
    tree: (params = {}) => ctx.get('/api/v1/accounts/tree', { searchParams: params }).then(unwrap),

    /**
     * Create an account. Idempotent on `(source, source_ref)` when both are
     * given — the response's `created` field says whether a row was made or an
     * existing one returned.
     */
    create: (data) => ctx.post('/api/v1/accounts', data).then(unwrap),

    /** Update account fields. Only the fields passed are changed. */
    update: (id, data) => ctx.patch(`/api/v1/accounts/${encodeURIComponent(id)}`, data).then(unwrap),

    /** Delete an account. Refused if it carries entries or has children. */
    delete: (id) => ctx.delete(`/api/v1/accounts/${encodeURIComponent(id)}`).then(unwrap),

    /**
     * Seed the org's system group accounts ('ASSETS', 'CASH', 'PAYABLES', …).
     *
     * A fresh org has none, and every account hangs beneath them, so call this
     * before creating the first account. Idempotent: creates only missing keys
     * and returns `{ created, existing }`, so it's safe before every import run.
     */
    seed: () => ctx.post('/api/v1/accounts/seed', {}).then(unwrap),

    /**
     * Resolve a seeded system group by its stable key — 'CASH', 'ASSETS'.
     *
     * Returns null when the key is not seeded rather than throwing, because a
     * caller finding no cash group should say so, not report a figure computed
     * from nothing.
     */
    findSystem: async (key) => {
      const result = await ctx.get('/api/v1/accounts', {
        searchParams: { source: 'system', source_ref: key },
      });
      return result?.data?.[0] ?? null;
    },
  };
}
