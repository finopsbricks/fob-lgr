// @ts-check
import { clientFor } from '../_helpers.js';
import { formatAmount } from '../utils/format.js';

export async function postTransactionHandler(argv) {
  const lgr = clientFor();
  const transaction = await lgr.transactions.post(argv.id);

  if (argv.json) {
    console.log(JSON.stringify(transaction, null, 2));
    return;
  }

  console.log(
    `Posted ${transaction.id} — Dr ${formatAmount(transaction.total_debit)} · Cr ${formatAmount(transaction.total_credit)}`,
  );
  console.log('It is now immutable. Correct it by voiding and posting a replacement.');
}

export async function voidTransactionHandler(argv) {
  const lgr = clientFor();

  if (!argv.yes) {
    const transaction = await lgr.transactions.get(argv.id);
    if (!transaction) {
      console.error(`Transaction '${argv.id}' not found.`);
      process.exit(1);
    }

    const { confirm } = await import('@inquirer/prompts');
    const ok = await confirm({
      message:
        `Void ${transaction.id} (${transaction.date}` +
        `${transaction.narration ? `, ${transaction.narration}` : ''})? ` +
        'It leaves the reports but stays on record.',
      default: false,
    });

    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  const transaction = await lgr.transactions.void(argv.id);

  if (argv.json) {
    console.log(JSON.stringify(transaction, null, 2));
    return;
  }

  console.log(`Voided ${transaction.id}. It is excluded from reports and cannot change again.`);
}

export async function deleteTransactionHandler(argv) {
  const lgr = clientFor();

  if (!argv.yes) {
    const { confirm } = await import('@inquirer/prompts');
    const ok = await confirm({
      message: `Delete draft ${argv.id}? This removes it entirely — void instead if it was ever posted.`,
      default: false,
    });

    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  await lgr.transactions.delete(argv.id);
  console.log(`Deleted ${argv.id}.`);
}
