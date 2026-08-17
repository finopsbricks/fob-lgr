// @ts-check
import { clientFor, resolveListScope } from '../_helpers.js';
import { formatTable, formatCsv, formatPaginationHint } from '../utils/format.js';

const COLUMNS = {
  id: { header: 'ID', align: 'left', render: (a) => String(a.id ?? '') },
  name: { header: 'NAME', align: 'left', render: (a) => a.name ?? '' },
  type: { header: 'TYPE', align: 'left', render: (a) => a.type ?? '' },
  normal_balance: { header: 'NORMAL', align: 'left', render: (a) => a.normal_balance ?? '' },
  source: { header: 'SOURCE', align: 'left', render: (a) => a.source ?? '' },
  source_ref: { header: 'REF', align: 'left', render: (a) => a.source_ref ?? '' },
  is_group: { header: 'GROUP', align: 'left', render: (a) => (a.is_group ? 'yes' : '') },
  status: { header: 'STATUS', align: 'left', render: (a) => a.status ?? '' },
};

const DEFAULT_FIELDS = ['id', 'name', 'type', 'source_ref', 'is_group', 'status'];

export async function listAccountsHandler(argv) {
  const lgr = clientFor();
  const fields = argv.fields ? argv.fields.split(',').map((f) => f.trim()) : DEFAULT_FIELDS;

  const searchParams = {
    type: argv.type,
    status: argv.status,
    source: argv.source,
    source_ref: argv.sourceRef,
    is_group: argv.groupsOnly ? 'true' : argv.postableOnly ? 'false' : undefined,
    parent: argv.parent,
    q: argv.q,
  };

  const { rows, pageContext } = await resolveListScope(argv, {
    list: lgr.accounts.list,
    getAll: lgr.accounts.getAll,
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
    console.log('(no accounts)');
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
}
