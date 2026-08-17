// @ts-check
import { readFileSync } from 'node:fs';
import { clientFor } from '../_helpers.js';
import { parseEntrySpecs } from './_entries.js';
import { formatAmount } from '../utils/format.js';

export async function createTransactionHandler(argv) {
  const lgr = clientFor();
  const entries = resolveEntries(argv);

  const payload = {
    date: argv.date,
    time: argv.time,
    narration: argv.narration,
    type: argv.type,
    status: argv.draft ? 'draft' : 'posted',
    currency: argv.currency,
    source: argv.source,
    source_ref: argv.sourceRef,
    entries,
  };

  if (argv.details) payload.details = JSON.parse(readFileSync(argv.details, 'utf8'));

  const transaction = await lgr.transactions.create(payload);

  if (argv.json) {
    console.log(JSON.stringify(transaction, null, 2));
    return;
  }

  if (transaction.created === false) {
    console.log(
      `Already imported as ${transaction.id} — nothing written.\n` +
        `A transaction with source '${payload.source}' and ref '${payload.source_ref}' exists already.`,
    );
    return;
  }

  console.log(
    `${transaction.status === 'draft' ? 'Drafted' : 'Posted'} ${transaction.id} — ` +
      `${transaction.date}${transaction.narration ? ` · ${transaction.narration}` : ''}`,
  );
  console.log(
    `${transaction.entries.length} entries · Dr ${formatAmount(transaction.total_debit)} · Cr ${formatAmount(transaction.total_credit)}`,
  );

  if (transaction.status === 'draft') {
    console.log(`\nPost it with: fob-lgr transactions post ${transaction.id}`);
  }
}

/**
 * Entries come from `--entries-json` or from repeated `--entry` flags, never
 * both — two sources for one field would leave the precedence unstated and the
 * result unpredictable.
 */
function resolveEntries(argv) {
  const specs = argv.entry ?? [];

  if (argv.entriesJson && specs.length) {
    throw new Error('Pass either --entries-json or --entry flags, not both.');
  }

  if (argv.entriesJson) {
    const raw = argv.entriesJson === '-'
      ? readFileSync(0, 'utf8')
      : readFileSync(argv.entriesJson, 'utf8');

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('--entries-json must contain a JSON array of entries.');
    }

    return parsed;
  }

  if (!specs.length) {
    throw new Error(
      "No entries given. Pass --entry 'account=<id>,debit=<minor units>' at least twice, or --entries-json <file>.",
    );
  }

  return parseEntrySpecs(specs);
}
