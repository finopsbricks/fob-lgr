// @ts-check
/**
 * Loading many transactions, without the caller writing a pool.
 *
 * `transactions.create` is one request per transaction. Anyone loading a month
 * of upstream output therefore wrote their own concurrency pool, their own
 * per-item error collection and their own progress line — the same problems,
 * re-solved per consumer, each slightly differently.
 *
 * `createMany` is the one place that work lives now. It chunks the input to
 * what the endpoint takes, keeps several batches in flight, and returns a
 * result per item in input order.
 */

import { ApiError } from '../http.js';

/** The ledger's limit on one `POST /api/v1/transactions/bulk`. */
export const MAX_BATCH_SIZE = 500;

/** Items per request when the caller does not say. */
export const DEFAULT_BATCH_SIZE = 100;

/**
 * Requests in flight when the caller does not say.
 *
 * The ledger's connection pool holds five and a batch holds one for its whole
 * run, so four leaves the API able to answer anything else while a load is
 * going on. Raising this past five does not make a load faster; it makes every
 * other caller wait.
 */
export const DEFAULT_CONCURRENCY = 4;

/**
 * @typedef {Object} ItemResult
 * @property {number} index - Position in the input, counted from 0
 * @property {'created'|'existing'|'valid'|'failed'} result
 * @property {string|null} id - The transaction, when there is one
 * @property {boolean} created
 * @property {string|null} source
 * @property {string|null} source_ref
 * @property {{ code?: string, message?: string, details?: any }} [error]
 */

/**
 * @typedef {Object} CreateManyOptions
 * @property {number} [concurrency] - Batches in flight
 * @property {number} [batch_size] - Items per request, capped at MAX_BATCH_SIZE
 * @property {boolean} [dry_run] - Validate and report; write nothing
 * @property {(progress: { done: number, created: number, existing: number, failed: number, valid: number }) => void} [onProgress]
 */

/**
 * @typedef {Object} CreateManyResult
 * @property {ItemResult[]} results - One per input item, in input order
 * @property {{ total: number, created: number, existing: number, failed: number, valid: number }} summary
 * @property {Array<{ index: number, item: any, error: any }>} failed - The items to re-push, with their reasons
 */

/**
 * Create many transactions, reporting on each one.
 *
 * `items` may be an array or any (async) iterable, so a caller reading an
 * NDJSON file streams it in rather than holding the parsed whole in memory.
 *
 * Never throws for a bad item — a refused transaction is a result with
 * `result: 'failed'` carrying the ledger's own code and figures. It throws
 * only when the request itself could not be made: bad credentials, an
 * unreachable host, a batch over the limit.
 *
 * @param {object} ctx - The bound transport
 * @param {Iterable<any>|AsyncIterable<any>} items
 * @param {CreateManyOptions} [options]
 * @returns {Promise<CreateManyResult>}
 */
export async function createMany(ctx, items, options = {}) {
  const batch_size = clampBatchSize(options.batch_size);
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
  const dry_run = options.dry_run === true;
  const onProgress = options.onProgress;

  /** @type {ItemResult[]} */
  const results = [];
  const summary = { total: 0, created: 0, existing: 0, failed: 0, valid: 0 };
  /** @type {Array<{ index: number, item: any, error: any }>} */
  const failed = [];

  // One sender per run: once a ledger has told us it has no bulk endpoint,
  // every later batch takes the fan-out path without asking again.
  const send = makeSender(ctx, dry_run);

  const in_flight = new Set();
  let fatal = null;

  const collect = (batch_results, chunk, offset) => {
    for (const result of batch_results) {
      results[result.index] = result;
      summary.total += 1;
      if (result.result in summary) summary[result.result] += 1;

      if (result.result === 'failed') {
        failed.push({
          index: result.index,
          item: chunk[result.index - offset] ?? null,
          error: result.error ?? null,
        });
      }
    }

    if (onProgress) {
      onProgress({
        done: summary.total,
        created: summary.created,
        existing: summary.existing,
        failed: summary.failed,
        valid: summary.valid,
      });
    }
  };

  // A batch promise never rejects. A rejection racing against its siblings
  // would leave the others unobserved, which Node reports as an unhandled
  // rejection and may exit on — so the first failure is recorded and the rest
  // are allowed to settle before it is re-thrown.
  const start = (chunk, offset) => {
    const promise = send(chunk, offset)
      .then(batch_results => collect(batch_results, chunk, offset))
      .catch((error) => { fatal = fatal ?? error; })
      .finally(() => in_flight.delete(promise));

    in_flight.add(promise);
    return promise;
  };

  const dispatch = async (chunk, offset) => {
    start(chunk, offset);
    if (in_flight.size >= concurrency) await Promise.race(in_flight);
    if (fatal) {
      await Promise.all(in_flight);
      throw fatal;
    }
  };

  let chunk = [];
  let offset = 0;

  for await (const item of items) {
    chunk.push(item);

    if (chunk.length === batch_size) {
      const ready = chunk;
      const at = offset;
      chunk = [];
      offset += ready.length;
      await dispatch(ready, at);
    }
  }

  if (chunk.length) await dispatch(chunk, offset);

  await Promise.all(in_flight);
  if (fatal) throw fatal;

  failed.sort((a, b) => a.index - b.index);

  return { results, summary, failed };
}

/**
 * The limit the ledger states, applied here too.
 *
 * Clamped rather than refused: a caller asking for 2,000 per request wants the
 * fewest round trips, and taking the largest allowed gives them that. Sending
 * 2,000 would simply be rejected.
 */
function clampBatchSize(requested) {
  if (!requested) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(requested)));
}

/**
 * How one chunk gets to the ledger.
 *
 * The bulk endpoint when there is one. A ledger that predates it answers 404,
 * and the chunk is then sent as one `POST` per transaction instead — the
 * caller still never writes a pool, which is the point. The fallback is
 * remembered, so an older ledger costs one wasted request per run rather than
 * one per batch.
 */
function makeSender(ctx, dry_run) {
  let has_bulk = true;

  return async function send(chunk, offset) {
    if (has_bulk) {
      try {
        const response = await ctx.post('/api/v1/transactions/bulk', {
          transactions: chunk,
          ...(dry_run ? { dry_run: true } : {}),
        });

        return (response?.data?.results ?? []).map(result => ({
          ...result,
          index: offset + result.index,
        }));
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        has_bulk = false;
      }
    }

    // Validating without the endpoint would mean re-implementing the ledger's
    // rules here, and reporting a row as valid without having checked it
    // against the real chart of accounts would be a lie.
    if (dry_run) {
      throw new ApiError(
        'This ledger has no bulk endpoint, so a dry run has nothing to validate against. Upgrade the ledger, or push for real.',
        { code: 'DRY_RUN_UNSUPPORTED', status: 404 },
      );
    }

    return sendOneByOne(ctx, chunk, offset);
  };
}

/**
 * The fallback: one request per transaction, in sequence within the chunk.
 *
 * Parallelism is already the caller's `concurrency` chunks in flight, so
 * fanning out again here would multiply the two.
 */
async function sendOneByOne(ctx, chunk, offset) {
  const results = [];

  for (let i = 0; i < chunk.length; i += 1) {
    const item = chunk[i];
    const index = offset + i;
    const source = item?.source ?? 'manual';
    const source_ref = item?.source_ref ?? null;

    try {
      const response = await ctx.post('/api/v1/transactions', item);
      const data = response?.data ?? {};

      results.push({
        index,
        source,
        source_ref,
        result: data.created === false ? 'existing' : 'created',
        id: data.id ?? null,
        created: data.created === true,
      });
    } catch (error) {
      // A rejected transaction is this row's problem. A rejected *key* is not
      // — marking 20,000 rows failed one at a time because the credentials are
      // wrong would bury the one fact worth reporting.
      if (!(error instanceof ApiError)) throw error;
      if (error.status === 401 || error.status === 403) throw error;

      results.push({
        index,
        source,
        source_ref,
        result: 'failed',
        id: null,
        created: false,
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
  }

  return results;
}
