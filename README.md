# fob-lgr

Client and CLI for [ledger.finopsbricks.com](https://ledger.finopsbricks.com) — a
double-entry **shadow ledger** that mirrors an upstream system of record as
correct double-entry.

Two things in one package. Import the client in a worker or agent; run the CLI
from a terminal. Both call the same resource layer in `src/resources/`, so they
cannot drift.

## Install

```bash
npm install -g @finopsbricks/fob-lgr
```

## The model in one line

A **transaction** is a dated fact. Its **entries** are how it lands on
**accounts**. The entries' debits equal their credits.

## Amounts

**Integers in minor units, everywhere.** `150000` is ₹1,500.00.

Nothing in this package converts decimals in either direction. A decimal is
refused rather than rounded, because rounding would silently move money between
what you meant and what the ledger stored. Convert at your own boundary,
deliberately.

## CLI

```bash
fob-lgr config add mycompany      # prompts for key and secret
fob-lgr getting-started
```

### Looking around

```bash
fob-lgr accounts tree                          # the whole chart, nested
fob-lgr accounts tree --hide-empty             # only what has something in it
fob-lgr accounts list --type expense
fob-lgr accounts show <id>
```

Every organization is seeded with group headings addressed by stable keys —
`CASH`, `PAYABLES`, `EXPENSES`. Nothing posts to a group; you hang your own
accounts beneath them. `accounts tree` marks them and shows their keys.

### Posting

```bash
fob-lgr transactions create \
  --date 2026-08-05 \
  --narration 'Rent paid — Aug 2026' \
  --type vendor_paid \
  --entry 'account=<rent-id>,debit=5000000' \
  --entry 'account=<bank-id>,credit=5000000'
```

`--entry` is repeatable — one per line of the transaction. Any `key=value` that
is not `account`, `debit`, `credit` or `memo` becomes a **dimension**:

```bash
  --entry 'account=<rent-id>,debit=3000000,cost_centre=Mumbai' \
  --entry 'account=<rent-id>,debit=2000000,cost_centre=Delhi' \
  --entry 'account=<bank-id>,credit=5000000'
```

Dimensions sit on the entry, not the transaction — which is exactly why one rent
payment can be split across two branches while the bank line belongs to neither.

For generated payloads, `--entries-json <file>` takes the array directly, and
`-` reads stdin.

### Loading a file

`create` makes one transaction per invocation, which is about 1.7 a second —
nearly all of it Node starting up. For anything bigger than a handful, `push`
takes a file:

```bash
fob-lgr transactions push --file august.ndjson
```

NDJSON: one transaction per line, each line the same object `create` builds.
`-` reads stdin. Measured against the live ledger, 500 transactions in 2.4
seconds.

```jsonc
{"date":"2026-08-05","source":"sap","source_ref":"4900001234","narration":"Rent — Aug","entries":[{"account_ref":"400100","debit":5000000},{"account_ref":"113100","credit":5000000}]}
```

`account_ref` is the account's own `source_ref`, resolved by the ledger. A file
produced from SAP knows accounts by their SAKNR and never by an id this ledger
generated, so there is nothing to pre-fetch and join. Add `account_source` when
two upstream systems both use the number.

| Option | |
|---|---|
| `--file <path>` | NDJSON, one transaction per line; `-` reads stdin |
| `--concurrency <n>` | Requests in flight (default 4) |
| `--batch-size <n>` | Transactions per request (default 100, max 500) |
| `--draft` | Load as drafts rather than posting |
| `--dry-run` | Check every row against the ledger and report; write nothing |
| `--no-continue-on-error` | Send no further batches once a row has failed |
| `--failed-out <path>` | Write the rows that failed, as NDJSON you can push again |
| `--json` | Per-item results as raw JSON |

**One bad row costs you that row.** It is reported with the line of the file it
came from, the other 499 are written, and the exit code is non-zero:

```
Pushed 500 transactions in 2.4s (206.0/s)

  created:         499
  existing:          0
  failed:            1

line  source_ref             code               why
----------------------------------------------------------------------------------
 151  4900001384             ACCOUNT_NOT_FOUND  Entry 0: no account with source_ref…
```

`--failed-out` writes exactly those rows back out. Fix them and push that file —
it is the input format, so nothing has to be assembled by hand.

Re-pushing is always safe. `(source, source_ref)` is the identity, so a second
run of the same file creates nothing and reports every row as `existing`. That
is what makes "run it again" the way to recover from a load that stopped
halfway.

Progress goes to stderr and results to stdout, so `--json | jq` stays clean
while you still see movement.

### Reading

```bash
fob-lgr transactions list --from 2026-04-01 --to 2026-06-30
fob-lgr transactions list --account <id> --dimension cost_centre=Mumbai
fob-lgr transactions show <id>

fob-lgr entries list --account <id> --totals --all
fob-lgr entries list --unallocated --from 2026-04-01   # missing a dimension
```

`entries` is the grain most analysis wants: *what landed on this account, in
this period, under this cost centre*. It defaults to posted transactions only —
an entry on a draft is not part of the books.

`--totals` over one page says so. Pass `--all` for a figure that covers
everything matched.

### Lifecycle

```bash
fob-lgr transactions create --draft …    # may be unbalanced
fob-lgr transactions post <id>           # balance check runs here
fob-lgr transactions void <id>           # the only way to reverse a posted one
```

A posted transaction is immutable. Correct one by voiding it and posting a
replacement — that is what keeps the mirror reconcilable against the system it
mirrors.

Two exceptions:

```bash
fob-lgr transactions set-type <id> vendor_paid      # type moves no balance: any status
fob-lgr transactions delete-many --source tally     # only while the org has Allow hard delete on
```

`delete-many` shows how many transactions it would delete and asks first. Use it
to clear an import that turned out wrong before re-importing it; an org admin
turns hard delete on in the ledger's settings.

### Trial balance

```bash
fob-lgr reports trial-balance --as-of 2026-11-13
fob-lgr reports trial-balance --as-of 2026-11-13 --format json   # rows carry source and source_ref
```

Every account's balance as at a date, posted transactions only, on the side it
falls. Use it to check an import against its source without summing entries.

## Errors

Refusals carry the figures involved, not just a sentence:

```
Error [UNBALANCED]: Debits and credits must be equal. Debits total 5000000, credits total 4500000, a difference of 500000.

  total_debit:       5000000
  total_credit:      4500000
  difference:        500000
  entry_count:       3
```

The `difference` is usually the line you left out.

## Library

```js
import { fobLgr } from '@finopsbricks/fob-lgr';

const lgr = fobLgr({ api_key, api_secret });   // api_url optional

const { data } = await lgr.transactions.list({ date_from: '2026-04-01' });

const txn = await lgr.transactions.create({
  date: '2026-08-05',
  narration: 'Rent paid — Aug 2026',
  source: 'sap',
  source_ref: '4900001234',
  entries: [
    { account: rent_id, debit: 5000000 },
    { account: bank_id, credit: 5000000 },
  ],
});
```

Credentials are bound once per client. Multi-tenant workers construct one client
per organization.

`ApiError` carries `code`, `status` and `details`:

```js
import { ApiError } from '@finopsbricks/fob-lgr';

try {
  await lgr.transactions.create(payload);
} catch (err) {
  if (err instanceof ApiError && err.code === 'UNBALANCED') {
    console.error(`short by ${err.details.difference}`);
  }
}
```

### Namespaces

| Namespace | Methods |
|---|---|
| `accounts` | `list`, `getAll`, `get`, `tree`, `create`, `update`, `delete`, `findSystem` |
| `transactions` | `list`, `getAll`, `get`, `create`, `createMany`, `update`, `setType`, `post`, `void`, `delete`, `deleteMany`, `countForDelete` |
| `entries` | `list`, `getAll`, `unallocated` |
| `reports` | `trialBalance` |

`entries` is read-only. An entry is written only as part of a transaction —
one writable on its own could leave a transaction unbalanced.

## Importing from another system

Send `source` and `source_ref` on everything. Together they identify the row, so
re-running an interrupted sync updates rather than duplicating:

```js
await lgr.transactions.create({ source: 'sap', source_ref: '4900001234', … });
// created: false on a re-send — nothing was written
```

For more than a handful, `createMany` chunks to the bulk endpoint and keeps
several batches in flight. **Do not write the pool** — that is what this is:

```js
const { results, summary, failed } = await lgr.transactions.createMany(rows, {
  concurrency: 4,
  batch_size: 100,
  onProgress: ({ done, created, failed }) => process.stderr.write(`\r${done} · ${created} created · ${failed} failed`),
});
```

`rows` may be any iterable, so an NDJSON stream goes straight in. A refused
transaction comes back as a result — `created`, `existing` or `failed` with the
ledger's own code and figures — in input order, whatever order the batches
finished in. Only a refused *request* throws: bad credentials, a batch over the
limit. `failed` carries the items themselves, ready to be pushed again.

An entry may name its account by `account_ref` (the account's `source_ref`)
instead of by id, so a file from an upstream system needs no join against the
chart first.

### Mirroring two systems at once

A granular subsystem feeding a summarised one can be held here at both levels;
`source` keeps the namespaces apart. Post the two layers against **different
accounts**, with the summary layer hitting a clearing account. That account must
return to zero at every summary posting date — when it does not, the two layers
disagree and something upstream went wrong.

## Configuration

Profiles live in `~/.fob/fob-lgr/config.yml`, mode 0600. Override the directory
with `FOB_LGR_CONFIG_DIR`.

The CLI does not read API credentials from environment variables. An env var
that silently overrode the active profile would post to the wrong organization's
books.

```bash
fob-lgr config list
fob-lgr config use <name>
fob-lgr --profile other accounts tree     # one-off override
```

`FOB_DEBUG=1` prints stack traces.
