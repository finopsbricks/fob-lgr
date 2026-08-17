/**
 * CLI entry point — three-level command tree:
 *
 *   fob-lgr <resource> <action> [target] [options]
 *
 * Credentials come from ~/.fob/fob-lgr/config.yml; `config` manages them.
 *
 * Every command is a thin wrapper over the resource layer in src/resources/, so
 * the CLI and the importable client cannot disagree about what an endpoint does.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Command } from 'commander';

import { setOrgOverride } from './config-store.js';
import { safe, configureTreeHelp } from './_helpers.js';
import { buildConfigCommand } from './config/index.js';
import { buildAccountsCommand } from './accounts/index.js';
import { buildTransactionsCommand } from './transactions/index.js';
import { buildEntriesCommand } from './entries/index.js';

function packageVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')).version;
}

export function run(argv) {
  const program = new Command();

  program
    .name('fob-lgr')
    .description('Double-entry shadow ledger — chart of accounts, transactions, entries')
    .usage('<resource> <action> [target] [options]')
    .version(packageVersion(), '-v, --version', 'Show version number')
    .option('--profile, --org <name>', 'Use a specific configured profile for this command')
    .hook('preAction', (thisCommand) => {
      const { profile } = thisCommand.opts();
      if (profile) setOrgOverride(profile);
    });

  program
    .command('getting-started')
    .description('Print setup instructions')
    .action(safe(gettingStartedHandler));

  program
    .addCommand(buildConfigCommand())
    .addCommand(buildAccountsCommand())
    .addCommand(buildTransactionsCommand())
    .addCommand(buildEntriesCommand())
    .allowUnknownOption(false)
    .showHelpAfterError();

  configureTreeHelp(program);

  program.parse(argv, { from: 'user' });
}

function gettingStartedHandler() {
  console.log(`fob-lgr — the ledger CLI

1. Add a profile
     fob-lgr config add mycompany
   You will be prompted for the API key and secret. Create them under
   Settings → API Keys in the ledger app.

2. Look at the chart of accounts
     fob-lgr accounts tree
   Every organization starts with seeded group headings. Nothing posts to
   those — you hang your own accounts beneath them.

3. Create two accounts you can post to
     fob-lgr accounts create --name 'HDFC Current A/c' --type asset
     fob-lgr accounts create --name 'Rent Expense' --type expense

4. Post a transaction
   Amounts are integers in minor units: 5000000 is Rs 50,000.00.

     fob-lgr transactions create \\
       --date 2026-08-05 \\
       --narration 'Rent paid — Aug 2026' \\
       --type vendor_paid \\
       --entry 'account=<rent-id>,debit=5000000' \\
       --entry 'account=<bank-id>,credit=5000000'

   Debits must equal credits. If they do not, the error tells you by how
   much — and the difference is usually the line you left out.

5. Read it back
     fob-lgr transactions list --from 2026-08-01 --to 2026-08-31
     fob-lgr entries list --account <bank-id> --totals --all

If you are importing from another system, pass --source and --source-ref on
everything. Together they identify the row, so re-running an interrupted
sync updates rather than duplicating.
`);
}
