# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
