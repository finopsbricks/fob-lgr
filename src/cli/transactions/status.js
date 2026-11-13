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
      message: `Delete ${argv.id}? This removes it entirely. A posted or void one can only be deleted while the org has hard delete on.`,
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

export async function setTypeHandler(argv) {
  const lgr = clientFor();
  const transaction = await lgr.transactions.setType(argv.id, argv.type);

  if (argv.json) {
    console.log(JSON.stringify(transaction, null, 2));
    return;
  }

  console.log(`${transaction.id} is now '${transaction.type}'.`);
}

export async function deleteManyTransactionsHandler(argv) {
  const lgr = clientFor();
  const filter = { source: argv.source, date_from: argv.from, date_to: argv.to };
  const range = argv.from || argv.to ? ` dated ${argv.from || '…'} to ${argv.to || '…'}` : '';

  const { matched } = await lgr.transactions.countForDelete(filter);
  if (!matched) {
    console.log(`No transactions from '${argv.source}'${range}.`);
    return;
  }

  if (!argv.yes) {
    const { confirm } = await import('@inquirer/prompts');
    const ok = await confirm({
      message: `Permanently delete ${matched} transactions from '${argv.source}'${range}? This can't be undone.`,
      default: false,
    });

    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  const result = await lgr.transactions.deleteMany(filter);

  if (argv.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Deleted ${result.deleted} transactions from '${argv.source}'${range}.`);
}
