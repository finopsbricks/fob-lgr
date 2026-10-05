// @ts-check
import { clientFor } from '../_helpers.js';

export async function createAccountHandler(argv) {
  const lgr = clientFor();

  const account = await lgr.accounts.create({
    name: argv.name,
    type: argv.type,
    parent: argv.parent,
    is_group: argv.group === true,
    source: argv.source,
    source_ref: argv.sourceRef,
    description: argv.description,
  });

  if (argv.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  // `created` distinguishes a new account from an idempotent re-send matching an
  // existing (source, source_ref). Reporting "Created" for the second would tell
  // an importer it had done something it had not.
  const verb = account.created === false ? 'Matched existing' : 'Created';
  console.log(`${verb} account ${account.id} — ${account.name} (${account.type})`);

  if (account.is_group) {
    console.log('This is a group heading. Nothing can be posted to it directly.');
  }
}

export async function updateAccountHandler(argv) {
  const lgr = clientFor();

  const changes = {};
  if (argv.name !== undefined) changes.name = argv.name;
  if (argv.type !== undefined) changes.type = argv.type;
  if (argv.parent !== undefined) changes.parent = argv.parent;
  if (argv.description !== undefined) changes.description = argv.description;
  if (argv.group !== undefined) changes.is_group = argv.group;

  if (!Object.keys(changes).length) {
    console.error('Nothing to change. Pass at least one field flag.');
    process.exit(1);
  }

  const account = await lgr.accounts.update(argv.id, changes);

  if (argv.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  console.log(`Updated ${account.id} — ${Object.keys(changes).join(', ')}`);
}

/**
 * Status changes get their own commands rather than a `--status` flag, because
 * the three states differ in consequence and the command name is where that can
 * be said. `retire` and `quarantine` read differently; `--status quarantined`
 * does not read as anything.
 */
export function setStatusHandler(status) {
  return async (argv) => {
    const lgr = clientFor();
    const account = await lgr.accounts.update(argv.id, { status });

    if (argv.json) {
      console.log(JSON.stringify(account, null, 2));
      return;
    }

    console.log(`${account.name} is now ${status}.`);

    if (status === 'retired') {
      console.log('Hidden from live listings; still counted in historical reports.');
    } else if (status === 'quarantined') {
      console.log('Excluded from reports and refused for new entries.');
    }
  };
}

export async function deleteAccountHandler(argv) {
  const lgr = clientFor();

  if (!argv.yes) {
    const account = await lgr.accounts.get(argv.id);
    if (!account) {
      console.error(`Account '${argv.id}' not found.`);
      process.exit(1);
    }

    const { confirm } = await import('@inquirer/prompts');
    const ok = await confirm({
      message: `Delete '${account.name}'? Retiring it keeps historical reports correct instead.`,
      default: false,
    });

    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  await lgr.accounts.delete(argv.id);
  console.log(`Deleted ${argv.id}.`);
}

export async function seedAccountsHandler(argv) {
  const lgr = clientFor();

  const result = await lgr.accounts.seed();

  if (argv.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.created.length) {
    console.log(`Seeded ${result.created.length} system groups: ${result.created.join(', ')}`);
  } else {
    console.log(`Nothing to seed — all ${result.existing.length} system groups already exist.`);
  }
}
