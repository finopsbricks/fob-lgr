# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-11-18

### Added
- `fob-lgr transactions push --file <ndjson>`: load a file of transactions in one command. One transaction per line, `-` reads stdin. `--concurrency`, `--batch-size`, `--draft`, `--dry-run`, `--no-continue-on-error`, `--failed-out <path>`, `--json`. Measured against the live ledger: 500 transactions in 2.4s (206/sec), against 1.7/sec for `transactions create` one at a time.
- `transactions.createMany(items, { concurrency, batch_size, dry_run, onProgress })`: chunks to the bulk endpoint, keeps several batches in flight, and returns a result per item in input order. `items` may be any iterable, so an NDJSON file streams rather than being parsed whole. A refused transaction is a result; only a refused request throws. Needs a ledger with `POST /api/v1/transactions/bulk` — against an older one it falls back to one request per transaction, so the caller still never writes a pool.
- Entries may name their account by `account_ref` (the account's `source_ref`) instead of by the generated id, resolved by the ledger. Removes the chart pre-fetch every importer was writing. `account_source` disambiguates when two upstream systems use the same number.

### Notes
- Partial success is a result, not an error: `push` exits non-zero when any row failed, having kept the rows that succeeded and written the failures to `--failed-out` as a file you can fix and push again.

## [0.4.0] - 2026-11-14

### Added
- `reports.trialBalance({ as_of })` and `fob-lgr reports trial-balance --as-of <date>`: every account's balance as at a date in one request, each row with its `source` and `source_ref`. Needs a ledger with `GET /api/v1/reports/trial-balance`.

## [0.3.0] - 2026-11-14

### Added
- `transactions.setType(id, type)` and `fob-lgr transactions set-type <id> <type>`: change a transaction's business event type in any status. Needs a ledger that accepts `type` alone on posted transactions.
- `transactions.deleteMany(filter)`, `transactions.countForDelete(filter)` and `fob-lgr transactions delete-many --source <s> [--from] [--to]`: delete every transaction from one source while the org has Allow hard delete on. The CLI shows the count and asks before deleting.

### Changed
- `transactions.delete` and `fob-lgr transactions delete` also delete posted and void transactions while the org has hard delete on.

## [0.2.1] - 2026-10-05

### Fixed
- The global `--profile` / `--org` flag was ignored in the committed source: commander stores `--profile, --org <name>` as `opts().org`, but the CLI read `opts().profile`, so commands ran against the current profile instead of the one named. The published 0.2.0 happened to include the fix from an uncommitted edit; 0.2.1 is the first version where the source in git matches.
- Type errors in consumers that type-check through the package: `apiRequest`'s options had no JSDoc, so `tsc` reported `credentials` and `searchParams` as missing on `{}` (TS2339) in `src/http.js`. The request functions now share a `RequestOptions` type.
- 0.2.0 shipped two stray screenshots under `src/` (~600 KB). The package now includes only `src/**/*.js`.

### Changed
- `npm publish` refuses to run from a working tree with uncommitted or untracked files, so every published version matches a commit.
- `npm run typecheck` works: added the `jsconfig.json` it expects.

## [0.2.0] - 2026-10-05

### Added
- `accounts.seed()` and `fob-lgr accounts seed`: create the org's system group accounts (`ASSETS`, `CASH`, `PAYABLES`, …) that every other account hangs beneath. Idempotent: creates only the missing ones and returns `{ created, existing }`, so it's safe to call before every import run.

### Notes
- Deprecated: this version's package contains two unrelated screenshots, and doesn't match the `chore: 0.2.0` commit (it includes the `--profile` fix listed under 0.2.1). Use 0.2.1.

## [0.1.0] - 2026-08-31

### Added
- Initial release: ledger client (`fobLgr()` with accounts, transactions and entries) and the `fob-lgr` CLI.
