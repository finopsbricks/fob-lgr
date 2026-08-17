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
| `transactions` | `list`, `getAll`, `get`, `create`, `update`, `post`, `void`, `delete` |
| `entries` | `list`, `getAll`, `unallocated` |

`entries` is read-only. An entry is written only as part of a transaction —
one writable on its own could leave a transaction unbalanced.

## Importing from another system

Send `source` and `source_ref` on everything. Together they identify the row, so
re-running an interrupted sync updates rather than duplicating:

```js
await lgr.transactions.create({ source: 'sap', source_ref: '4900001234', … });
// created: false on a re-send — nothing was written
```

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
