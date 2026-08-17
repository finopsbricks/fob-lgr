/**
 * Subtree builder for `fob-lgr transactions <action>`.
 */

import { Command, Option } from 'commander';

import { safe, listOptions, jsonOption } from '../_helpers.js';
import { collectEntry } from './_entries.js';
import { listTransactionsHandler } from './list.js';
import { showTransactionHandler } from './show.js';
import { createTransactionHandler } from './create.js';
import {
  postTransactionHandler,
  voidTransactionHandler,
  deleteTransactionHandler,
} from './status.js';

export function buildTransactionsCommand() {
  const transactions = new Command('transactions').alias('t').description('Transactions and their entries');

  listOptions(transactions.command('list').description('List transactions'))
    .option('--from <yyyy-mm-dd>', 'Accounting date from (inclusive)')
    .option('--to <yyyy-mm-dd>', 'Accounting date to (inclusive)')
    .addOption(
      new Option('--status <status>', 'Filter by status').choices(['draft', 'posted', 'void']),
    )
    .option('--type <type>', 'Filter by business event type')
    .option('--account <id>', 'Only transactions with an entry against this account')
    .option('--source <source>', 'Filter by origin system')
    .option('--source-ref <ref>', 'Filter by upstream document id')
    .option('--dimension <key=value>', 'Filter by an entry dimension (repeatable)', collectEntry)
    .option('--q <text>', 'Substring match on narration')
    .addOption(new Option('--sort-order <order>', 'Date sort order').choices(['ASC', 'DESC']))
    .option('--fields <list>', 'Columns to show, comma-separated')
    .addOption(new Option('--format <format>', 'Output format').choices(['table', 'csv', 'json']))
    .action(safe(listTransactionsHandler));

  jsonOption(
    transactions
      .command('show')
      .description('Show one transaction with its entries')
      .argument('<id>', 'Transaction ID'),
  ).action(safe(showTransactionHandler));

  jsonOption(
    transactions
      .command('create')
      .description('Create a transaction. Amounts are integers in minor units (150000 = Rs 1,500.00)')
      .requiredOption('--date <yyyy-mm-dd>', 'Accounting date')
      .option(
        '--entry <spec>',
        "One entry, repeatable: 'account=<id>,debit=<minor>' or 'account=<id>,credit=<minor>'. " +
          'Any other key=value becomes a dimension.',
        collectEntry,
      )
      .option('--entries-json <file>', "JSON array of entries; '-' reads stdin")
      .option('--narration <text>', 'What happened, in words')
      .option('--type <type>', "Business event, e.g. 'vendor_paid'")
      .option('--time <hh:mm>', 'Wall-clock time, when the source gives one')
      .option('--currency <code>', 'Currency (default INR)')
      .option('--source <source>', "Origin system (default 'manual')")
      .option('--source-ref <ref>', 'Upstream document id — makes the create idempotent')
      .option('--details <file>', 'JSON file holding the upstream event as it arrived')
      .option('--draft', 'Create as an unbalanced-allowed draft rather than posting'),
  ).action(safe(createTransactionHandler));

  jsonOption(
    transactions
      .command('post')
      .description('Post a draft. Refused unless debits equal credits')
      .argument('<id>', 'Transaction ID'),
  ).action(safe(postTransactionHandler));

  jsonOption(
    transactions
      .command('void')
      .description('Void a transaction — the only way to reverse a posted one')
      .argument('<id>', 'Transaction ID')
      .option('-y, --yes', 'Skip confirmation'),
  ).action(safe(voidTransactionHandler));

  transactions
    .command('delete')
    .description('Delete a draft. Posted transactions must be voided instead')
    .argument('<id>', 'Transaction ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(safe(deleteTransactionHandler));

  return transactions;
}
