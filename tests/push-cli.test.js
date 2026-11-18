import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildTransactions } from '../src/resources/transactions.js';

/**
 * `transactions push`, end to end over a stub ledger.
 *
 * The handler is exercised with the real `createMany` behind it, because the
 * things worth asserting here — which file lines map to which results, what
 * lands in `--failed-out`, what the exit code is — all span the two.
 */
const clientFor = jest.fn();
jest.unstable_mockModule('../src/cli/_helpers.js', () => ({
  clientFor,
  safe: (h) => h,
  listOptions: (c) => c,
  jsonOption: (c) => c,
  paginationOptions: (c) => c,
  resolveListScope: jest.fn(),
  configureTreeHelp: jest.fn(),
}));

const { pushTransactionsHandler } = await import('../src/cli/transactions/push.js');

let dir;
let out;
let err;

/** A ledger that decides each transaction's fate by its source_ref. */
function stubLedger({ fail_refs = [], delay = 0 } = {}) {
  const batches = [];

  const ctx = {
    post: async (path, body) => {
      batches.push(body);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));

      return {
        data: {
          results: body.transactions.map((item, index) => (
            fail_refs.includes(item.source_ref)
              ? {
                index,
                source: item.source ?? null,
                source_ref: item.source_ref ?? null,
                result: 'failed',
                id: null,
                created: false,
                error: { code: 'UNBALANCED', message: 'Debits and credits must be equal.', details: { difference: 100 } },
              }
              : {
                index,
                source: item.source ?? null,
                source_ref: item.source_ref ?? null,
                result: body.dry_run ? 'valid' : 'created',
                id: `txn_${item.source_ref}`,
                created: !body.dry_run,
              }
          )),
        },
      };
    },
  };

  clientFor.mockReturnValue({ transactions: buildTransactions(ctx) });
  return { batches };
}

const row = (n, extra = {}) => JSON.stringify({
  date: '2026-08-17',
  source: 'sap',
  source_ref: `ref${n}`,
  entries: [{ account_ref: '400100', debit: 100 }, { account_ref: '113100', credit: 100 }],
  ...extra,
});

function ndjson(lines) {
  const path = join(dir, `in-${Math.random().toString(36).slice(2)}.ndjson`);
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fob-push-'));
  out = [];
  err = [];
  process.exitCode = undefined;
  clientFor.mockReset();
  jest.spyOn(console, 'log').mockImplementation(line => out.push(String(line)));
  jest.spyOn(console, 'error').mockImplementation(line => err.push(String(line)));
});

afterEach(() => {
  jest.restoreAllMocks();
  process.exitCode = undefined;
});

describe('transactions push — loading a file', () => {
  it('loads every row in one command, in batches', async () => {
    const { batches } = stubLedger();
    const file = ndjson([row(1), row(2), row(3), row(4), row(5)]);

    await pushTransactionsHandler({ file, batchSize: 2, concurrency: 1 });

    expect(batches.map(b => b.transactions.length)).toEqual([2, 2, 1]);
    expect(out.join('\n')).toMatch(/Pushed 5 transactions/);
    expect(out.join('\n')).toMatch(/created:\s+5/);
    expect(process.exitCode).toBeUndefined();
  });

  it('skips blank lines rather than counting them', async () => {
    stubLedger();
    const file = ndjson([row(1), '', '   ', row(2)]);

    await pushTransactionsHandler({ file, batchSize: 10 });

    expect(out.join('\n')).toMatch(/Pushed 2 transactions/);
  });

  it('loads as drafts when asked, whatever the file says', async () => {
    // An explicit flag beats the file: someone typing --draft means it.
    const { batches } = stubLedger();
    const file = ndjson([row(1), row(2, { status: 'posted' })]);

    await pushTransactionsHandler({ file, draft: true, batchSize: 10 });

    expect(batches[0].transactions.map(t => t.status)).toEqual(['draft', 'draft']);
  });

  it('passes a dry run through and writes nothing', async () => {
    const { batches } = stubLedger();
    const file = ndjson([row(1), row(2)]);

    await pushTransactionsHandler({ file, dryRun: true, batchSize: 10 });

    expect(batches[0].dry_run).toBe(true);
    expect(out.join('\n')).toMatch(/Checked 2 transactions/);
    expect(out.join('\n')).toMatch(/valid:\s+2/);
  });
});

describe('transactions push — one bad row', () => {
  it('fails alone, is reported with its file line, and the rest land', async () => {
    stubLedger({ fail_refs: ['ref2'] });
    const file = ndjson([row(1), row(2), row(3)]);

    await pushTransactionsHandler({ file, batchSize: 10 });

    const text = out.join('\n');
    expect(text).toMatch(/created:\s+2/);
    expect(text).toMatch(/failed:\s+1/);
    // Line 2 of the file, not index 1 of some batch.
    expect(text).toMatch(/\n\s+2\s+ref2\s+UNBALANCED/);
    expect(process.exitCode).toBe(1);
  });

  it('writes the failed rows to --failed-out, re-pushable as they are', async () => {
    stubLedger({ fail_refs: ['ref2'] });
    const file = ndjson([row(1), row(2), row(3)]);
    const failed_out = join(dir, 'failed.ndjson');

    await pushTransactionsHandler({ file, batchSize: 10, failedOut: failed_out });

    const written = readFileSync(failed_out, 'utf8').trim().split('\n');
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0]).source_ref).toBe('ref2');
    expect(err.join('\n')).toMatch(/Wrote 1 failed row to /);
  });

  it('re-pushing the failed file creates no duplicates', async () => {
    // The second run is a fresh ledger stub that has them already.
    stubLedger({ fail_refs: ['ref2'] });
    const file = ndjson([row(1), row(2), row(3)]);
    const failed_out = join(dir, 'failed.ndjson');
    await pushTransactionsHandler({ file, batchSize: 10, failedOut: failed_out });

    const { batches } = stubLedger();
    out.length = 0;
    process.exitCode = undefined;

    await pushTransactionsHandler({ file: failed_out, batchSize: 10 });

    expect(batches[0].transactions.map(t => t.source_ref)).toEqual(['ref2']);
    expect(out.join('\n')).toMatch(/Pushed 1 transactions/);
    expect(process.exitCode).toBeUndefined();
  });

  it('writes an empty --failed-out when nothing failed', async () => {
    // So a scripted retry can run unconditionally against the file.
    stubLedger();
    const file = ndjson([row(1)]);
    const failed_out = join(dir, 'failed.ndjson');

    await pushTransactionsHandler({ file, batchSize: 10, failedOut: failed_out });

    expect(existsSync(failed_out)).toBe(true);
    expect(readFileSync(failed_out, 'utf8')).toBe('');
  });
});

describe('transactions push — a row the file itself got wrong', () => {
  it('reports an unreadable line without sending it, and keeps it verbatim', async () => {
    const { batches } = stubLedger();
    const file = ndjson([row(1), '{ not json', row(2)]);
    const failed_out = join(dir, 'failed.ndjson');

    await pushTransactionsHandler({ file, batchSize: 10, failedOut: failed_out });

    expect(batches[0].transactions).toHaveLength(2);
    expect(out.join('\n')).toMatch(/unreadable:\s+1/);
    expect(out.join('\n')).toMatch(/INVALID_JSON_LINE/);
    expect(readFileSync(failed_out, 'utf8').trim()).toBe('{ not json');
    expect(process.exitCode).toBe(1);
  });

  it('refuses a line that is valid JSON but not an object', async () => {
    stubLedger();
    const file = ndjson([row(1), '[1, 2, 3]']);

    await pushTransactionsHandler({ file, batchSize: 10 });

    expect(out.join('\n')).toMatch(/not a JSON object/);
  });
});

describe('transactions push — output discipline', () => {
  it('puts the results on stdout under --json and the progress on stderr', async () => {
    stubLedger({ fail_refs: ['ref2'] });
    const file = ndjson([row(1), row(2)]);

    await pushTransactionsHandler({ file, batchSize: 10, json: true });

    const parsed = JSON.parse(out.join('\n'));
    expect(parsed.summary).toMatchObject({ total: 2, created: 1, failed: 1 });
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[1].error.code).toBe('UNBALANCED');
    // Nothing but data on stdout.
    expect(out.join('\n')).not.toMatch(/Pushed/);
  });
});

describe('transactions push — refusals before anything is read', () => {
  it('refuses a batch size that is not a positive number', async () => {
    stubLedger();
    await expect(pushTransactionsHandler({ file: ndjson([row(1)]), batchSize: 0 }))
      .rejects.toThrow(/--batch-size/);
  });

  it('refuses a concurrency that is not a positive number', async () => {
    stubLedger();
    await expect(pushTransactionsHandler({ file: ndjson([row(1)]), concurrency: -1 }))
      .rejects.toThrow(/--concurrency/);
  });
});
