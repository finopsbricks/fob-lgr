/**
 * Subtree builder for `fob-lgr entries <action>`.
 *
 * Read-only. Entries are written only as part of a transaction — see
 * `fob-lgr transactions create`.
 */

import { Command, Option } from 'commander';

import { safe, listOptions, clientFor, resolveListScope } from '../_helpers.js';
import { formatTable, formatCsv, formatAmount, formatPaginationHint } from '../utils/format.js';
import { collectEntry } from '../transactions/_entries.js';

const COLUMNS = {
  date: { header: 'DATE', align: 'left', render: (e) => e.date ?? '' },
  account: { header: 'ACCOUNT', align: 'left', render: (e) => e.account ?? '' },
  debit: { header: 'DEBIT', align: 'right', render: (e) => formatAmount(e.debit) },
  credit: { header: 'CREDIT', align: 'right', render: (e) => formatAmount(e.credit) },
  narration: { header: 'NARRATION', align: 'left', render: (e) => (e.narration ?? '').slice(0, 40) },
  memo: { header: 'MEMO', align: 'left', render: (e) => e.memo ?? '' },
  dimensions: {
    header: 'DIMENSIONS',
    align: 'left',
    render: (e) => (e.dimensions ? Object.entries(e.dimensions).map(([k, v]) => `${k}=${v}`).join(' ') : ''),
  },
  transaction: { header: 'TXN', align: 'left', render: (e) => e.transaction ?? '' },
  source_ref: { header: 'REF', align: 'left', render: (e) => e.source_ref ?? '' },
  id: { header: 'ID', align: 'left', render: (e) => e.id ?? '' },
};

const DEFAULT_FIELDS = ['date', 'account', 'debit', 'credit', 'narration', 'dimensions'];

export function buildEntriesCommand() {
  const entries = new Command('entries').alias('e').description('Individual ledger lines (read-only)');

  listOptions(
    entries
      .command('list')
      .description('List entries. Defaults to posted transactions only'),
  )
    .option('--account <id>', 'Only entries against this account')
    .option('--from <yyyy-mm-dd>', "Parent transaction's date from (inclusive)")
    .option('--to <yyyy-mm-dd>', "Parent transaction's date to (inclusive)")
    .addOption(
      new Option('--status <status>', "Parent status; 'all' includes drafts")
        .choices(['posted', 'draft', 'void', 'all'])
        .default('posted'),
    )
    .option('--type <type>', 'Parent transaction type')
    .option('--transaction <id>', 'Entries of one transaction')
    .option('--dimension <key=value>', 'Filter by dimension (repeatable)', collectEntry)
    .option('--unallocated', 'Only entries carrying no dimensions at all')
    .option('--fields <list>', 'Columns to show, comma-separated')
    .addOption(new Option('--format <format>', 'Output format').choices(['table', 'csv', 'json']))
    .option('--totals', 'Show debit and credit sums over everything matched')
    .action(safe(listEntriesHandler));

  return entries;
}

async function listEntriesHandler(argv) {
  const lgr = clientFor();
  const fields = argv.fields ? argv.fields.split(',').map((f) => f.trim()) : DEFAULT_FIELDS;

  if (argv.unallocated && argv.dimension?.length) {
    throw new Error(
      '--unallocated and --dimension are contradictory: an entry cannot both carry a dimension and carry none.',
    );
  }

  const searchParams = {
    account: argv.account,
    date_from: argv.from,
    date_to: argv.to,
    status: argv.status,
    type: argv.type,
    transaction: argv.transaction,
    has_dimension: argv.unallocated ? 'false' : undefined,
    ...dimensionParams(argv.dimension),
  };

  const { rows, allRows, pageContext, truncated } = await resolveListScope(argv, {
    list: lgr.entries.list,
    getAll: lgr.entries.getAll,
    searchParams,
  });

  const format = argv.format ?? (argv.json ? 'json' : 'table');

  if (format === 'json') {
    console.log(JSON.stringify({ data: rows, count: rows.length }, null, 2));
    return;
  }

  const known = fields.filter((f) => COLUMNS[f]);

  if (format === 'csv') {
    console.log(formatCsv(known, rows.map((r) => known.map((f) => COLUMNS[f].render(r)))));
    return;
  }

  if (rows.length === 0) {
    console.log('(no entries)');
    return;
  }

  console.log(
    formatTable(
      known.map((f) => COLUMNS[f].header),
      rows.map((r) => known.map((f) => COLUMNS[f].render(r))),
      { align: known.map((f) => COLUMNS[f].align) },
    ),
  );

  const hint = formatPaginationHint(pageContext);
  if (hint) console.log(`\n${hint}`);

  if (argv.totals) printTotals(allRows, argv, truncated);
}

/**
 * Debit and credit sums, plus the net.
 *
 * Only meaningful over a complete result set, so a total computed from one page
 * says so — a figure that silently covered the first 100 of 4,000 entries is
 * the most dangerous thing this command could print.
 */
function printTotals(rows, argv, truncated) {
  const total_debit = rows.reduce((sum, e) => sum + Number(e.debit || 0), 0);
  const total_credit = rows.reduce((sum, e) => sum + Number(e.credit || 0), 0);

  console.log(`\nTOTALS over ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}:`);
  console.log(`  Debit:   ${formatAmount(total_debit) || '0.00'}`);
  console.log(`  Credit:  ${formatAmount(total_credit) || '0.00'}`);
  console.log(`  Net:     ${formatAmount(Math.abs(total_debit - total_credit)) || '0.00'}${
    total_debit === total_credit ? '' : total_debit > total_credit ? ' Dr' : ' Cr'
  }`);

  if (!argv.all) {
    console.log('  (this page only — pass --all to total every matching entry)');
  }
  if (truncated) {
    console.log('  (truncated — narrow the filters for a complete total)');
  }
}

/** `--dimension cost_centre=Mumbai` → `{ 'dimension.cost_centre': 'Mumbai' }` */
function dimensionParams(dimensions) {
  const params = {};

  for (const pair of dimensions ?? []) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      throw new Error(`--dimension '${pair}' is not key=value. Example: --dimension cost_centre=Mumbai`);
    }
    params[`dimension.${pair.slice(0, eq).trim()}`] = pair.slice(eq + 1).trim();
  }

  return params;
}
