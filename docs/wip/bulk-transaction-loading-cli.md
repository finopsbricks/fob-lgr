# The CLI needs to load a file of transactions

## Status: IN PROGRESS (~50%): `transactions.createMany` and its tests are in. Next: `transactions push`, then verify against the live API and release.
## Priority: P2: every bulk load into the ledger currently forks a private script, and each one re-solves the same five problems
## Bet: first-class-cli

`fob-lgr transactions create` makes exactly one transaction per invocation. Anyone loading more than a few hundred writes their own script against the library instead.

That has already happened once. `ather/shadow-ledger/push_to_fob_lgr.mjs` exists only because the CLI could not do the job, and the Ather warranty-provisioning spike is about to be the second. **Two consumers bypassing the same tool is a gap in the tool, not a coincidence.**

The requirement was written from the consumer side, in `/tmp/lgr-bulk-wip.md`. This file is the half that belongs here; the API half is in `apps/ledger.finopsbricks.com/docs/wip/bulk-transaction-loading-api.md`.

---

## The principle

A CLI exists so that the common jobs do not need a program. When a caller has to drop to the library to do an ordinary thing — load a month of transactions — the CLI has not finished its job.

## What the bypass script had to hand-roll

| Hand-rolled | Where it lives now |
|---|---|
| A concurrency pool (`runPool`) | `transactions.createMany`, `--concurrency` |
| Account id resolution from a `source_ref` map | The ledger resolves `account_ref` itself |
| Per-item error collection | `createMany` returns a result per item |
| A retry path (`--source-refs`) | `--failed-out`, a file the tool produced |
| Progress and ETA | `onProgress`, rendered on stderr |

## Decisions taken

| Question | Answer |
|---|---|
| Default concurrency | **4.** The ledger's pool holds five connections and a batch holds one for its whole run. Past five a load does not get faster; everything else gets slower |
| Default batch size | **100.** The endpoint takes 500; 100 keeps a retried batch small and the progress line moving |
| What if the ledger has no bulk endpoint? | `createMany` falls back to one `POST` per transaction on a 404, and remembers. **The caller never writes the pool**, whichever way the transport works |
| `--continue-on-error` is the default — so what does the flag do? | It is explicit, and `--no-continue-on-error` is its negation. Stopping is the thing worth a flag; continuing is the thing worth being able to say out loud |
| Where does a bad JSON line count? | As a failed item, written to `--failed-out` as the raw line. A file you can fix and re-push beats a run that aborted on line 8,000 |

## Implementation

### Phase 1: `transactions.createMany` ✅
- [x] `src/resources/createMany.js` — chunks, keeps batches in flight, collects per-item results, reports progress
- [x] Accepts any iterable, so an NDJSON file streams rather than being parsed whole
- [x] Results in input order whatever order the batches finish in
- [x] A refused transaction is a result; a refused *request* (401, 413) throws
- [x] `tests/createMany.test.js`

### Phase 2: `fob-lgr transactions push` ❌
- [ ] `--file`, `--concurrency`, `--batch-size`, `--draft`, `--dry-run`, `--continue-on-error`, `--failed-out`, `--json`
- [ ] Progress on stderr, results on stdout
- [ ] Exit non-zero when any row failed

### Phase 3: release ❌
- [ ] README, CHANGELOG, version bump; alex publishes

### Phase 4: the real test ❌
- [ ] `push_to_fob_lgr.mjs` deleted and the shadow-ledger load run through the CLI. That repo is not this agent's to touch, so this is alex's call

## Related

- [Command Grammar](https://github.com/alexjv89/engineering-standards/blob/main/cli/command-grammar.md) — the `<resource> <action>` shape and the standard verb `push`
- [Error Handling](https://github.com/alexjv89/engineering-standards/blob/main/cli/error-handling.md) — exit codes and how failures are reported
- [Output & Formatting](https://github.com/alexjv89/engineering-standards/blob/main/cli/output-formatting.md) — `--json` everywhere, stdout against stderr
