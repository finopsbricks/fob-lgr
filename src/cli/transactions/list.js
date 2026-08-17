// @ts-check
import { clientFor, resolveListScope } from '../_helpers.js';
import { formatTable, formatCsv, formatAmount, formatPaginationHint } from '../utils/format.js';

const COLUMNS = {
  id: { header: 'ID', align: 'left', render: (t) => String(t.id ?? '') },
  date: { header: 'DATE', align: 'left', render: (t) => t.date ?? '' },
  time: { header: 'TIME', align: 'left', render: (t) => t.time ?? '' },
  narration: { header: 'NARRATION', align: 'left', render: (t) => (t.narration ?? '').slice(0, 44) },
  type: { header: 'TYPE', align: 'left', render: (t) => t.type ?? '' },
  status: { header: 'STATUS', align: 'left', render: (t) => t.status ?? '' },
  amount: { header: 'AMOUNT', align: 'right', render: (t) => formatAmount(t.total_debit) },
  source: { header: 'SOURCE', align: 'left', render: (t) => t.source ?? '' },
  source_ref: { header: 'REF', align: 'left', render: (t) => t.source_ref ?? '' },
  entries: { header: 'LINES', align: 'right', render: (t) => String(t.entries?.length ?? '') },
};

const DEFAULT_FIELDS = ['id', 'date', 'narration', 'type', 'status', 'amount'];

export async function listTransactionsHandler(argv) {
  const lgr = clientFor();
  const fields = argv.fields ? argv.fields.split(',').map((f) => f.trim()) : DEFAULT_FIELDS;

  const searchParams = {
    date_from: argv.from,
    date_to: argv.to,
    status: argv.status,
    type: argv.type,
    account: argv.account,
    source: argv.source,
    source_ref: argv.sourceRef,
    q: argv.q,
    sort_order: argv.sortOrder,
    ...dimensionParams(argv.dimension),
  };

  const { rows, pageContext } = await resolveListScope(argv, {
    list: lgr.transactions.list,
    getAll: lgr.transactions.getAll,
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
    console.log('(no transactions)');
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

  // Drafts are excluded from every report, so a list that silently contains
  // them can suggest activity the books do not have.
  const drafts = rows.filter((r) => r.status === 'draft').length;
  if (drafts && !argv.status) {
    console.log(`\n${drafts} draft${drafts === 1 ? '' : 's'} shown — drafts are excluded from reports.`);
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
