// @ts-check
import { clientFor } from '../_helpers.js';
import { formatField, formatTable, formatAmount, formatSection } from '../utils/format.js';

export async function showTransactionHandler(argv) {
  const lgr = clientFor();
  const transaction = await lgr.transactions.get(argv.id);

  if (!transaction) {
    console.error(`Transaction '${argv.id}' not found.`);
    process.exit(1);
  }

  if (argv.json) {
    console.log(JSON.stringify(transaction, null, 2));
    return;
  }

  const w = 14;
  const header = [
    formatField('ID', transaction.id, w),
    formatField('Date', transaction.date + (transaction.time ? ` ${transaction.time}` : ''), w),
    formatField('Narration', transaction.narration, w),
    formatField('Type', transaction.type, w),
    formatField('Status', transaction.status, w),
    formatField('Currency', transaction.currency, w),
  ];

  if (transaction.source_ref) {
    header.push(formatField('Source', `${transaction.source} · ${transaction.source_ref}`, w));
  } else {
    header.push(formatField('Source', transaction.source, w));
  }

  console.log(header.join('\n'));

  console.log(formatSection('Entries'));

  const entries = transaction.entries ?? [];
  console.log(
    formatTable(
      ['ACCOUNT', 'DEBIT', 'CREDIT', 'MEMO', 'DIMENSIONS'],
      entries.map((e) => [
        e.account,
        formatAmount(e.debit),
        formatAmount(e.credit),
        e.memo ?? '',
        e.dimensions ? Object.entries(e.dimensions).map(([k, v]) => `${k}=${v}`).join(' ') : '',
      ]),
      { align: ['left', 'right', 'right', 'left', 'left'] },
    ),
  );

  const dr = transaction.total_debit ?? 0;
  const cr = transaction.total_credit ?? 0;

  console.log(`\n${'Totals:'.padEnd(w)}  Dr ${formatAmount(dr)} · Cr ${formatAmount(cr)}`);

  // A posted transaction can only reach this state through the balance check,
  // so a mismatch here means something bypassed the write path. Worth shouting
  // about rather than leaving the reader to compare two numbers.
  if (dr !== cr) {
    console.log(`\n!! Unbalanced by ${formatAmount(Math.abs(dr - cr))} — this should not be possible for a posted transaction.`);
  }
}
