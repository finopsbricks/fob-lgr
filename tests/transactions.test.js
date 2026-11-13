import { describe, it, expect } from '@jest/globals';
import { buildTransactions } from '../src/resources/transactions.js';

function stubCtx() {
  const calls = [];
  const record = (method) => async (...args) => {
    calls.push([method, ...args]);
    return { data: { ok: true } };
  };
  return { calls, ctx: { get: record('get'), post: record('post'), patch: record('patch'), delete: record('delete') } };
}

describe('transactions resource', () => {
  it('sets the type with a PATCH carrying only type', async () => {
    const { calls, ctx } = stubCtx();
    await buildTransactions(ctx).setType('txn1', 'vendor_paid');
    expect(calls).toEqual([['patch', '/api/v1/transactions/txn1', { type: 'vendor_paid' }]]);
  });

  it('bulk deletes by filter on the collection', async () => {
    const { calls, ctx } = stubCtx();
    await buildTransactions(ctx).deleteMany({ source: 'tally', date_from: '2026-04-01' });
    expect(calls).toEqual([['delete', '/api/v1/transactions', { searchParams: { source: 'tally', date_from: '2026-04-01' } }]]);
  });

  it('counts for a bulk delete as a dry run', async () => {
    const { calls, ctx } = stubCtx();
    await buildTransactions(ctx).countForDelete({ source: 'tally' });
    expect(calls).toEqual([['delete', '/api/v1/transactions', { searchParams: { source: 'tally', dry_run: true } }]]);
  });
});
