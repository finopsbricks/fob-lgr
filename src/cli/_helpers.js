/**
 * Shared CLI helpers.
 *
 * Two groups: command-tree helpers (`safe`, the option builders,
 * `configureTreeHelp`) used by the per-resource builders, and handler-facing
 * helpers (`clientFor`, `resolveListScope`) used by the handlers themselves.
 */

import { resolveCredentials } from './config-store.js';
import { fobLgr } from '../index.js';
import { ApiError, MAX_ALL_ROWS } from '../http.js';

/**
 * Adapt a handler taking one merged `argv` to commander's
 * `(…positionals, opts, cmd)` signature, and give it clean-exit behaviour on an
 * unexpected throw (`FOB_DEBUG=1` for the stack).
 *
 * Merging positionals and options into one object is what lets handlers stay
 * framework-agnostic — they receive the same shape regardless of what parses the
 * command line.
 */
export function safe(handler) {
  return async (...args) => {
    const cmd = args[args.length - 1];
    const opts = args[args.length - 2];
    const positionals = args.slice(0, -2);

    const argv = { ...opts };
    const declared = cmd.registeredArguments ?? [];
    declared.forEach((arg, i) => {
      argv[toCamel(arg.name())] = positionals[i];
    });

    // Global options live on the root command, not the leaf — merge them down
    // so handlers reading argv.org (commander names `--profile, --org` by its last long flag) keep working. Leaf values win.
    let parent = cmd.parent;
    while (parent) {
      Object.assign(argv, parent.opts(), argv);
      parent = parent.parent;
    }

    try {
      await handler(argv);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  };
}

/**
 * Print an error the way the ledger reports one.
 *
 * The `details` object is printed rather than dropped, because for this API it
 * carries the part worth reading: which entry index was wrong, what the debits
 * and credits totalled, what the difference was. A CLI that showed only
 * "Debits and credits must be equal" would be throwing away the number that
 * identifies the missing line.
 */
function reportError(err) {
  if (err instanceof ApiError) {
    console.error(`Error${err.code ? ` [${err.code}]` : ''}: ${err.message}`);

    if (err.details && Object.keys(err.details).length) {
      console.error('');
      for (const [key, value] of Object.entries(err.details)) {
        const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
        console.error(`  ${(key + ':').padEnd(18)} ${rendered}`);
      }
    }
  } else {
    console.error(`Error: ${err.message}`);
  }

  if (process.env.FOB_DEBUG) console.error(err.stack);
}

/** `date-from` → `dateFrom`, matching commander's option-name camelisation. */
function toCamel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** A ledger client bound to the credentials the current command resolves to. */
export function clientFor() {
  return fobLgr(resolveCredentials());
}

/** Standard pagination + JSON output options for list commands. */
export function paginationOptions(cmd) {
  return cmd
    .option('--page <n>', 'Page number', Number, 1)
    .option('--limit <n>', 'Page size (max 500)', Number, 100)
    .option('--json', 'Output raw JSON');
}

/**
 * Pagination options plus `--all`. Scope is independent of output format —
 * `--json` fetches one page unless `--all` is also passed.
 */
export function listOptions(cmd) {
  return paginationOptions(cmd).option(
    '--all',
    `Fetch every matching row across all pages (capped at ${MAX_ALL_ROWS}), ignoring --limit/--page`,
  );
}

/** `--json` alone — the most repeated option in the tree. */
export function jsonOption(cmd) {
  return cmd.option('--json', 'Output raw JSON');
}

/**
 * Run a list either one page at a time or across all pages, per `--all`.
 *
 * Returns both the rows to display and the full set, so a command computing
 * totals reports them over everything matched rather than over the page that
 * happened to be shown — a total that silently covered only the first 100 rows
 * would be the most dangerous output this CLI could produce.
 */
export async function resolveListScope(argv, { list, getAll, searchParams }) {
  if (argv.all) {
    const rows = await getAll(searchParams);
    return {
      rows,
      allRows: rows,
      pageContext: null,
      truncated: rows.length >= MAX_ALL_ROWS,
    };
  }

  const result = await list({ ...searchParams, page: argv.page, limit: argv.limit });
  const rows = result?.data ?? [];

  return {
    rows,
    allRows: rows,
    pageContext: result?.page_context ?? null,
    truncated: false,
  };
}

/**
 * Help formatting for the whole tree.
 *
 * Commander does not inherit `configureHelp()` through `addCommand()`, so this
 * walks the tree rather than being set once at the root.
 */
export function configureTreeHelp(cmd) {
  cmd.configureHelp({
    helpWidth: process.stdout.columns || 92,
    showGlobalOptions: true,
    subcommandTerm: (c) => {
      const name = c.aliases().length ? `${c.name()}|${c.aliases().join('|')}` : c.name();
      return `${name} ${c.usage().replace(/\[options\] ?/, '')}`.trim();
    },
  });

  for (const child of cmd.commands) configureTreeHelp(child);
}
