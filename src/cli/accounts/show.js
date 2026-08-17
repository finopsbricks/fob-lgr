// @ts-check
import { clientFor } from '../_helpers.js';
import { formatField, formatSection } from '../utils/format.js';

export async function showAccountHandler(argv) {
  const lgr = clientFor();
  const account = await lgr.accounts.get(argv.id);

  if (!account) {
    console.error(`Account '${argv.id}' not found.`);
    process.exit(1);
  }

  if (argv.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  const w = 18;
  const lines = [
    formatField('ID', account.id, w),
    formatField('Name', account.name, w),
    formatField('Type', account.type, w),
    // Both derived from type, never stored. Shown because they are what a
    // caller needs to read a balance the right way round.
    formatField('Normal balance', account.normal_balance, w),
    formatField('Statement', account.statement, w),
    formatField('Status', account.status, w),
    formatField('Postable', account.is_group ? 'no — group heading' : 'yes', w),
  ];

  if (account.parent) lines.push(formatField('Parent', account.parent, w));

  lines.push(formatField('Source', account.source, w));
  if (account.source_ref) {
    lines.push(
      formatField(
        account.source === 'system' ? 'System key' : 'Source ref',
        account.source_ref,
        w,
      ),
    );
  }

  if (account.description) lines.push(formatField('Description', account.description, w));

  console.log(lines.join('\n'));

  if (account.source === 'system') {
    console.log(formatSection('System account'));
    console.log(
      `Seeded group addressed by reports as '${account.source_ref}'.\n` +
        'Its name can be changed freely; its type and key cannot — changing either\n' +
        'would misfile everything beneath it with nothing to indicate it happened.',
    );
  }
}
