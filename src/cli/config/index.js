/**
 * Subtree builder for `fob-lgr config <action>` — credential profiles.
 */

import { Command } from 'commander';

import { safe } from '../_helpers.js';
import {
  addOrg,
  removeOrg,
  useOrg,
  listProfiles,
  describeCurrent,
} from '../config-store.js';
import { DEFAULT_API_URL } from '../../http.js';
import { formatTable, formatField } from '../utils/format.js';

export function buildConfigCommand() {
  const config = new Command('config').description('Manage credential profiles');

  config
    .command('add')
    .description('Add a profile')
    .argument('<name>', 'Profile name, e.g. an org shorthand')
    .option('--api-key <key>', 'API key')
    .option('--api-secret <secret>', 'API secret')
    .option('--api-url <url>', `API origin (default ${DEFAULT_API_URL})`)
    .action(safe(addProfileHandler));

  config
    .command('list')
    .alias('ls')
    .description('List configured profiles')
    .action(safe(listProfilesHandler));

  config
    .command('use')
    .description('Switch the active profile')
    .argument('<name>', 'Profile name')
    .action(safe(useProfileHandler));

  config
    .command('current')
    .description('Show which credentials the CLI would use right now')
    .action(safe(currentProfileHandler));

  config
    .command('remove')
    .alias('rm')
    .description('Remove a profile')
    .argument('<name>', 'Profile name')
    .action(safe(removeProfileHandler));

  return config;
}

/**
 * Secrets are prompted rather than taken from flags where possible: a flag
 * value lands in shell history, and these credentials can write to a ledger.
 */
async function addProfileHandler(argv) {
  const { input, password } = await import('@inquirer/prompts');

  const api_url = argv.apiUrl ?? (await input({ message: 'API URL', default: DEFAULT_API_URL }));
  const api_key = argv.apiKey ?? (await input({ message: 'API key' }));
  const api_secret = argv.apiSecret ?? (await password({ message: 'API secret', mask: true }));

  if (!api_key || !api_secret) {
    throw new Error('Both an API key and secret are required.');
  }

  addOrg(argv.name, { api_url, api_key, api_secret });
  console.log(`Added profile '${argv.name}'.`);

  const { current } = listProfiles();
  if (current === argv.name) console.log(`It is now the active profile.`);
}

function listProfilesHandler() {
  const { profiles, path, current } = listProfiles();

  if (!profiles.length) {
    console.log('No profiles configured. Run `fob-lgr config add <name>`.');
    return;
  }

  console.log(
    formatTable(
      ['', 'NAME', 'API URL'],
      profiles.map((p) => [p.current ? '*' : '', p.name, p.api_url ?? DEFAULT_API_URL]),
    ),
  );

  console.log(`\nActive: ${current ?? '(none)'}`);
  console.log(`Config: ${path}`);
}

function useProfileHandler(argv) {
  useOrg(argv.name);
  console.log(`Now using profile '${argv.name}'.`);
}

function currentProfileHandler() {
  const current = describeCurrent();

  if (!current) {
    console.log('No profile selected. Run `fob-lgr config add <name>`.');
    return;
  }

  console.log(
    [
      formatField('Profile', current.name, 10),
      formatField('API URL', current.api_url ?? DEFAULT_API_URL, 10),
      formatField('Source', current.source, 10),
    ].join('\n'),
  );
}

function removeProfileHandler(argv) {
  removeOrg(argv.name);
  console.log(`Removed profile '${argv.name}'.`);
}
