/**
 * Subtree builder for `fob-lgr accounts <action>`.
 */

import { Command, Option } from 'commander';

import { safe, listOptions, jsonOption } from '../_helpers.js';
import { listAccountsHandler } from './list.js';
import { treeAccountsHandler } from './tree.js';
import { showAccountHandler } from './show.js';
import {
  createAccountHandler,
  updateAccountHandler,
  setStatusHandler,
  deleteAccountHandler,
} from './write.js';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

export function buildAccountsCommand() {
  const accounts = new Command('accounts').alias('a').description('The chart of accounts');

  listOptions(accounts.command('list').description('List accounts'))
    .addOption(new Option('--type <type>', 'Filter by accounting type').choices(ACCOUNT_TYPES))
    .addOption(
      new Option('--status <status>', 'Filter by lifecycle status').choices([
        'active',
        'retired',
        'quarantined',
      ]),
    )
    .option('--source <source>', "Filter by origin ('manual', 'system', or an upstream name)")
    .option('--source-ref <ref>', 'Filter by upstream identifier or system key')
    .option('--parent <id>', "Direct children of this account; 'root' for top level")
    .option('--groups-only', 'Only group headings')
    .option('--postable-only', 'Only accounts entries can be posted to')
    .option('--q <text>', 'Substring match on name')
    .option('--fields <list>', 'Columns to show, comma-separated')
    .addOption(new Option('--format <format>', 'Output format').choices(['table', 'csv', 'json']))
    .action(safe(listAccountsHandler));

  jsonOption(
    accounts
      .command('tree')
      .description('Show the whole chart of accounts as a tree')
      .option('--hide-empty', 'Omit group headings with nothing beneath them')
      .addOption(
        new Option('--status <status>', 'Filter by lifecycle status').choices([
          'active',
          'retired',
          'quarantined',
        ]),
      ),
  ).action(safe(treeAccountsHandler));

  jsonOption(
    accounts.command('show').description('Show one account').argument('<id>', 'Account ID'),
  ).action(safe(showAccountHandler));

  jsonOption(
    accounts
      .command('create')
      .description('Create an account')
      .requiredOption('--name <name>', 'Account name')
      .addOption(
        new Option('--type <type>', 'Accounting type').choices(ACCOUNT_TYPES).makeOptionMandatory(),
      )
      .option('--parent <id>', 'Parent group account (must be a group of the same type)')
      .option('--group', 'Create as a group heading — nothing can be posted to it')
      .option('--description <text>', 'Description')
      .option('--source <source>', "Origin system (default 'manual')")
      .option('--source-ref <ref>', 'Upstream identifier — makes the create idempotent'),
  ).action(safe(createAccountHandler));

  jsonOption(
    accounts
      .command('update')
      .description('Update an account (only the flags you pass are changed)')
      .argument('<id>', 'Account ID')
      .option('--name <name>', 'Account name')
      .addOption(new Option('--type <type>', 'Accounting type').choices(ACCOUNT_TYPES))
      .option('--parent <id>', 'Parent group account')
      .option('--description <text>', 'Description')
      .option('--group', 'Make this a group heading')
      .option('--no-group', 'Make this a postable account'),
  ).action(safe(updateAccountHandler));

  jsonOption(
    accounts
      .command('retire')
      .description('Retire an account — hidden from listings, still in historical reports')
      .argument('<id>', 'Account ID'),
  ).action(safe(setStatusHandler('retired')));

  jsonOption(
    accounts
      .command('quarantine')
      .description('Quarantine an account — excluded from reports, refuses new entries')
      .argument('<id>', 'Account ID'),
  ).action(safe(setStatusHandler('quarantined')));

  jsonOption(
    accounts
      .command('reactivate')
      .description('Set an account back to active')
      .argument('<id>', 'Account ID'),
  ).action(safe(setStatusHandler('active')));

  accounts
    .command('delete')
    .description('Delete an account (refused if it has entries or children)')
    .argument('<id>', 'Account ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(safe(deleteAccountHandler));

  return accounts;
}
