import { describe, it, expect, jest } from '@jest/globals';
import { buildTransactions } from '../src/resources/transactions.js';
import { MAX_BATCH_SIZE, DEFAULT_BATCH_SIZE } from '../src/resources/createMany.js';
import { ApiError } from '../src/http.js';

/**
 * A ledger that answers the bulk endpoint.
 *
 * `verdict(item, index)` decides what each transaction gets, so a test
 * declares the outcome it is about and nothing else. Every call is recorded,
 * which is how batching and concurrency are asserted — both are invisible in
 * the return value.
 */
function stubLedger({ verdict = () => 'created', delay = 0 } = {}) {
  const calls = [];
  let in_flight = 0;
  let peak_in_flight = 0;

  const ctx = {
    post: async (path, body) => {
      calls.push({ path, body });

      if (path !== '/api/v1/transactions/bulk') {
        throw new ApiError('Not found', { code: 'HTTP_ERROR', status: 404 });
      }

      in_flight += 1;
      peak_in_flight = Math.max(peak_in_flight, in_flight);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      in_flight -= 1;

      return {
        data: {
          results: body.transactions.map((item, index) => {
            const outcome = verdict(item, index);
            if (outcome === 'failed') {
              return {
                index,
                source: item.source ?? null,
                source_ref: item.source_ref ?? null,
                result: 'failed',
                id: null,
                created: false,
                error: { code: 'UNBALANCED', message: 'no', details: { difference: 50000 } },
              };
            }
            return {
              index,
              source: item.source ?? null,
              source_ref: item.source_ref ?? null,
              result: outcome,
              id: `txn_${item.source_ref}`,
              created: outcome === 'created',
            };
          }),
          summary: {},
        },
      };
    },
  };

  return { ctx, calls, batches: () => calls.filter(c => c.path.endsWith('/bulk')), peak: () => peak_in_flight };
}

const item = (n) => ({ date: '2026-08-17', source: 'sap', source_ref: `ref${n}`, entries: [] });
const items = (count) => Array.from({ length: count }, (_, i) => item(i));

describe('createMany — chunking', () => {
  it('sends one batch per batch_size items', async () => {
    const { ctx, batches } = stubLedger();

    const { summary } = await buildTransactions(ctx).createMany(items(250), { batch_size: 100 });

    expect(batches()).toHaveLength(3);
    expect(batches().map(b => b.body.transactions.length)).toEqual([100, 100, 50]);
    expect(summary).toMatchObject({ total: 250, created: 250, failed: 0 });
  });

  it('defaults to a batch size the endpoint accepts', async () => {
    const { ctx, batches } = stubLedger();
    await buildTransactions(ctx).createMany(items(DEFAULT_BATCH_SIZE + 1));
    expect(batches()[0].body.transactions).toHaveLength(DEFAULT_BATCH_SIZE);
  });

  it('clamps a batch size the endpoint would reject', async () => {
    // A caller asking for 2,000 wants the fewest round trips. Sending 2,000
    // would simply be refused, so they get the largest that is not.
    const { ctx, batches } = stubLedger();
    await buildTransactions(ctx).createMany(items(MAX_BATCH_SIZE + 1), { batch_size: 2000 });
    expect(batches()[0].body.transactions).toHaveLength(MAX_BATCH_SIZE);
  });

  it('takes an async iterable, so a file streams rather than being read whole', async () => {
    const { ctx, batches } = stubLedger();

    async function* stream() {
      for (let i = 0; i < 25; i += 1) yield item(i);
    }

    const { summary } = await buildTransactions(ctx).createMany(stream(), { batch_size: 10 });

    expect(batches()).toHaveLength(3);
    expect(summary.total).toBe(25);
  });
});

describe('createMany — concurrency', () => {
  it('keeps several batches in flight at once', async () => {
    const { ctx, peak } = stubLedger({ delay: 5 });

    await buildTransactions(ctx).createMany(items(500), { batch_size: 50, concurrency: 4 });

    expect(peak()).toBeGreaterThan(1);
    expect(peak()).toBeLessThanOrEqual(4);
  });

  it('sends one at a time at concurrency 1', async () => {
    const { ctx, peak } = stubLedger({ delay: 5 });
    await buildTransactions(ctx).createMany(items(200), { batch_size: 50, concurrency: 1 });
    expect(peak()).toBe(1);
  });

  it('returns results in input order whatever order the batches finish in', async () => {
    // Batch 2 finishes before batch 0. Index is the caller's only handle on
    // which row a result belongs to, so it has to survive that.
    const order = [30, 20, 1];
    let batch = 0;
    const calls = [];

    const ctx = {
      post: async (path, body) => {
        const wait = order[batch] ?? 0;
        batch += 1;
        calls.push(body.transactions.map(t => t.source_ref));
        await new Promise(resolve => setTimeout(resolve, wait));
        return {
          data: {
            results: body.transactions.map((t, index) => ({
              index, source: t.source, source_ref: t.source_ref, result: 'created', id: `txn_${t.source_ref}`, created: true,
            })),
          },
        };
      },
    };

    const { results } = await buildTransactions(ctx).createMany(items(15), { batch_size: 5, concurrency: 3 });

    expect(results.map(r => r.source_ref)).toEqual(items(15).map(i => i.source_ref));
    expect(results.map(r => r.index)).toEqual([...Array(15).keys()]);
  });
});

describe('createMany — results', () => {
  it('collects a failure without stopping the run', async () => {
    const { ctx } = stubLedger({ verdict: (_, index) => (index === 2 ? 'failed' : 'created') });

    const { summary, results } = await buildTransactions(ctx).createMany(items(10), { batch_size: 5 });

    expect(summary).toMatchObject({ total: 10, created: 8, failed: 2 });
    expect(results[2].error.code).toBe('UNBALANCED');
  });

  it('hands back the failed items themselves, ready to be pushed again', async () => {
    // This is what replaces the bypass script's comma-separated retry list: the
    // retry input is a file the tool produced, not one assembled by hand.
    const { ctx } = stubLedger({ verdict: (item) => (item.source_ref === 'ref3' ? 'failed' : 'created') });

    const { failed } = await buildTransactions(ctx).createMany(items(10), { batch_size: 4 });

    expect(failed).toHaveLength(1);
    expect(failed[0].index).toBe(3);
    expect(failed[0].item).toEqual(item(3));
    expect(failed[0].error.code).toBe('UNBALANCED');
  });

  it('counts an already-imported transaction as existing, not created', async () => {
    const { ctx } = stubLedger({ verdict: () => 'existing' });
    const { summary } = await buildTransactions(ctx).createMany(items(5));
    expect(summary).toMatchObject({ created: 0, existing: 5, failed: 0 });
  });

  it('reports progress as batches land', async () => {
    const { ctx } = stubLedger();
    const seen = [];

    await buildTransactions(ctx).createMany(items(30), {
      batch_size: 10,
      concurrency: 1,
      onProgress: p => seen.push(p.done),
    });

    expect(seen).toEqual([10, 20, 30]);
  });

  it('passes dry_run through rather than guessing at the rules', async () => {
    const { ctx, batches } = stubLedger({ verdict: () => 'valid' });
    const { summary } = await buildTransactions(ctx).createMany(items(3), { dry_run: true });
    expect(batches()[0].body.dry_run).toBe(true);
    expect(summary).toMatchObject({ valid: 3, created: 0 });
  });
});

describe('createMany — refusals that are not about one row', () => {
  it('throws on bad credentials instead of marking every row failed', async () => {
    const ctx = {
      post: async () => { throw new ApiError('Invalid API credentials', { code: 'UNAUTHORIZED', status: 401 }); },
    };

    await expect(buildTransactions(ctx).createMany(items(10)))
      .rejects.toThrow(/Invalid API credentials/);
  });

  it('throws when the batch is over the ledger\'s limit', async () => {
    const ctx = {
      post: async () => { throw new ApiError('too big', { code: 'BATCH_TOO_LARGE', status: 413 }); },
    };

    const error = await buildTransactions(ctx).createMany(items(10)).catch(e => e);
    expect(error.code).toBe('BATCH_TOO_LARGE');
  });
});

describe('createMany — a ledger with no bulk endpoint', () => {
  it('falls back to one request per transaction, and the caller still writes no pool', async () => {
    const calls = [];
    const ctx = {
      post: async (path, body) => {
        calls.push(path);
        if (path === '/api/v1/transactions/bulk') {
          throw new ApiError('Not found', { code: 'HTTP_ERROR', status: 404 });
        }
        return { data: { id: `txn_${body.source_ref}`, created: true } };
      },
    };

    const { summary, results } = await buildTransactions(ctx).createMany(items(5), { batch_size: 2 });

    expect(summary).toMatchObject({ total: 5, created: 5, failed: 0 });
    expect(results[4].id).toBe('txn_ref4');
    // One probe, then singles. The 404 is not re-tried per batch.
    expect(calls.filter(c => c.endsWith('/bulk'))).toHaveLength(1);
    expect(calls.filter(c => c === '/api/v1/transactions')).toHaveLength(5);
  });

  it('refuses a dry run rather than validating against rules it does not own', async () => {
    const ctx = {
      post: async () => { throw new ApiError('Not found', { code: 'HTTP_ERROR', status: 404 }); },
    };

    const error = await buildTransactions(ctx).createMany(items(2), { dry_run: true }).catch(e => e);
    expect(error.code).toBe('DRY_RUN_UNSUPPORTED');
  });
});
