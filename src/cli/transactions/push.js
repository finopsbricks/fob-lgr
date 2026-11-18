// @ts-check
/**
 * `fob-lgr transactions push` — load a file of transactions.
 *
 * The command that stops the next bulk consumer writing a program. `create`
 * makes one transaction per invocation, which at a month's volume is an hour
 * of process startup, so everyone loading in bulk dropped to the library and
 * wrote their own pool, retry list and progress line.
 *
 * NDJSON rather than a JSON array, for two reasons that are really one: a
 * large file streams through line by line instead of being parsed whole, and
 * what `--failed-out` writes can be fed straight back in.
 */

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { clientFor } from '../_helpers.js';
import { formatTable } from '../utils/format.js';

/** How many failures are shown before the rest are left to `--failed-out`. */
const FAILURES_SHOWN = 20;

export async function pushTransactionsHandler(argv) {
  const lgr = clientFor();

  if (argv.batchSize !== undefined && !(argv.batchSize > 0)) {
    throw new Error('--batch-size must be a positive whole number of transactions');
  }
  if (argv.concurrency !== undefined && !(argv.concurrency > 0)) {
    throw new Error('--concurrency must be a positive whole number of requests');
  }

  // Continuing past a failure is the default, so the flag that has to be
  // declared is the negative one. Commander leaves the positive form
  // undefined when it is not typed, which is not the same as false.
  const continue_on_error = argv.continueOnError !== false;

  /** Rows the file itself got wrong, which never reach the ledger. */
  const unparsed = [];
  /** Input line number per item, so a failure names the line the user can open. */
  const line_numbers = [];
  const started_at = Date.now();

  let stop_producing = false;

  const items = (async function* read() {
    let line_number = 0;

    for await (const raw of readLines(argv.file)) {
      line_number += 1;
      const text = raw.trim();
      if (!text) continue;

      if (stop_producing) return;

      let item;
      try {
        item = JSON.parse(text);
      } catch (error) {
        // Kept out of the ledger's count and written back out verbatim: a file
        // you can fix and push again beats a run that aborted on line 8,000.
        unparsed.push({ line: line_number, raw, message: error.message });
        if (!continue_on_error) return;
        continue;
      }

      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        unparsed.push({ line: line_number, raw, message: 'line is not a JSON object' });
        if (!continue_on_error) return;
        continue;
      }

      if (argv.draft) item.status = 'draft';

      line_numbers.push(line_number);
      yield item;
    }
  })();

  const progress_line = progressReporter(started_at);

  const { results, summary, failed } = await lgr.transactions.createMany(items, {
    concurrency: argv.concurrency,
    batch_size: argv.batchSize,
    dry_run: Boolean(argv.dryRun),
    onProgress: (progress) => {
      // Stopping means sending no further batches. The ones already in flight
      // finish — cancelling them would leave the caller unable to say what
      // landed, which is the one thing a partial load has to be able to say.
      if (!continue_on_error && progress.failed > 0) stop_producing = true;
      progress_line.render(progress);
    },
  });

  progress_line.done();

  const failed_count = summary.failed + unparsed.length;

  if (argv.failedOut) {
    const lines = [
      ...unparsed.map(u => u.raw),
      ...failed.map(f => JSON.stringify(f.item)),
    ];
    writeFileSync(argv.failedOut, lines.length ? `${lines.join('\n')}\n` : '');
    // stderr: a note about a file is not part of the data.
    console.error(`Wrote ${lines.length} failed ${lines.length === 1 ? 'row' : 'rows'} to ${argv.failedOut}`);
  }

  if (argv.json) {
    console.log(JSON.stringify({
      summary: { ...summary, unparsed: unparsed.length },
      dry_run: Boolean(argv.dryRun),
      results,
      unparsed,
    }, null, 2));
  } else {
    report({ summary, results, unparsed, line_numbers, argv, started_at });
  }

  // Partial success is a result, not an exception — the successes are kept and
  // reported. The exit code is what a script branches on.
  if (failed_count > 0) process.exitCode = 1;
}

/** `-` reads stdin, so a push can be the end of a pipeline. */
function readLines(file) {
  const input = file === '-' ? process.stdin : createReadStream(file, 'utf8');
  return createInterface({ input, crlfDelay: Infinity });
}

/**
 * Progress on stderr, so a piped `--json` run stays machine-readable while a
 * person still sees movement. A load that takes an hour with no output is
 * indistinguishable from a hang.
 *
 * On a terminal it rewrites one line. Redirected to a file it prints nothing
 * until the end, rather than filling a log with half-written lines.
 */
function progressReporter(started_at) {
  const live = Boolean(process.stderr.isTTY);
  let last = null;

  const line = (progress) => {
    const seconds = (Date.now() - started_at) / 1000;
    const rate = seconds > 0 ? progress.done / seconds : 0;

    return `${progress.done.toLocaleString('en-US')} pushed · `
      + `${progress.created.toLocaleString('en-US')} created · `
      + `${progress.existing.toLocaleString('en-US')} existing · `
      + `${progress.failed.toLocaleString('en-US')} failed · `
      + `${rate.toFixed(1)}/s`;
  };

  return {
    render(progress) {
      last = progress;
      if (live) process.stderr.write(`\r\u001b[K${line(progress)}`);
    },
    done() {
      if (live) process.stderr.write('\r\u001b[K');
      if (last) console.error(line(last));
    },
  };
}

/** The human form: what happened, then every row that did not. */
function report({ summary, results, unparsed, line_numbers, argv, started_at }) {
  const seconds = (Date.now() - started_at) / 1000;
  const verb = argv.dryRun ? 'Checked' : 'Pushed';

  console.log(`${verb} ${summary.total.toLocaleString('en-US')} transactions in ${seconds.toFixed(1)}s (${(summary.total / Math.max(seconds, 0.001)).toFixed(1)}/s)`);
  console.log('');

  const counts = [
    argv.dryRun ? ['valid', summary.valid] : ['created', summary.created],
    ['existing', summary.existing],
    ['failed', summary.failed],
  ];
  if (unparsed.length) counts.push(['unreadable', unparsed.length]);

  for (const [label, value] of counts) {
    console.log(`  ${(label + ':').padEnd(12)} ${String(value).padStart(7)}`);
  }

  const rows = [
    ...unparsed.map(u => [String(u.line), '—', 'INVALID_JSON_LINE', u.message]),
    ...results
      .filter(result => result?.result === 'failed')
      .map(result => [
        String(line_numbers[result.index] ?? result.index + 1),
        result.source_ref ?? '—',
        result.error?.code ?? '—',
        result.error?.message ?? '—',
      ]),
  ];

  if (!rows.length) return;

  console.log('');
  console.log(formatTable(
    ['line', 'source_ref', 'code', 'why'],
    rows.slice(0, FAILURES_SHOWN).map(row => [row[0], row[1], row[2], truncate(row[3], 70)]),
    { align: ['right'] },
  ));

  if (rows.length > FAILURES_SHOWN) {
    console.log(`\n(${rows.length - FAILURES_SHOWN} more — use --json for all of them)`);
  }

  if (!argv.failedOut) {
    console.error('\nRe-push just these with --failed-out <path> next time.');
  }
}

function truncate(text, width) {
  const s = String(text);
  return s.length > width ? `${s.slice(0, width - 1)}…` : s;
}
