/**
 * Subtree builder for `fob-lgr reports <action>`. Read-only.
 */

import { Command, Option } from 'commander';

import { safe, clientFor } from '../_helpers.js';
import { formatTable, formatCsv, formatAmount } from '../utils/format.js';

const HEADERS = ['ACCOUNT', 'TYPE', 'DEBIT', 'CREDIT', 'ENTRIES'];
const ALIGN = ['left', 'left', 'right', 'right', 'right'];

export function buildReportsCommand() {
  const reports = new Command('reports').alias('r').description('Read-only reports over posted transactions');

  reports
    .command('trial-balance')
    .description('Every account with a balance as at a date, on the side it falls')
    .requiredOption('--as-of <yyyy-mm-dd>', 'Balances up to and including this date')
    .addOption(new Option('--format <format>', 'Output format').choices(['table', 'csv', 'json']))
    .action(safe(trialBalanceHandler));

  return reports;
}

async function trialBalanceHandler(argv) {
  const lgr = clientFor();
  const data = await lgr.reports.trialBalance({ as_of: argv.asOf });

  if (argv.format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const rows = data.rows.map((r) => [r.name, r.type, formatAmount(r.debit), formatAmount(r.credit), String(r.entry_count)]);

  if (argv.format === 'csv') {
    console.log(formatCsv(HEADERS, rows));
    return;
  }

  console.log(formatTable(HEADERS, [...rows, ['TOTAL', '', formatAmount(data.total_debit), formatAmount(data.total_credit), '']], { align: ALIGN }));
  console.log(data.total_debit === data.total_credit
    ? `\nAs at ${data.as_of}: debits equal credits.`
    : `\nAs at ${data.as_of}: debits and credits differ by ${formatAmount(Math.abs(data.total_debit - data.total_credit))}.`);
}
