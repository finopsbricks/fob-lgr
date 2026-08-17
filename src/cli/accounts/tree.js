// @ts-check
import { clientFor } from '../_helpers.js';

/**
 * Render the chart of accounts as an indented tree.
 *
 * The point of the command is orientation: what exists, what can be posted to,
 * and where. So group headings are marked and the seeded system keys are shown
 * alongside them — those keys are how reports address the chart, and they are
 * invisible in a plain list of names.
 */
export async function treeAccountsHandler(argv) {
  const lgr = clientFor();

  const result = await lgr.accounts.tree({
    status: argv.status,
    include_empty: argv.hideEmpty ? 'false' : undefined,
  });

  if (argv.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const accounts = result?.accounts ?? [];

  if (accounts.length === 0) {
    console.log('(no accounts)');
    return;
  }

  const lines = [];
  renderNodes(accounts, '', lines);
  console.log(lines.join('\n'));

  console.log(`\n${result.total} account${result.total === 1 ? '' : 's'}`);
  console.log('Group headings are marked [group] — nothing can be posted to them.');
}

/**
 * Depth-first render with box-drawing connectors.
 *
 * The last child of any node uses a different connector so the vertical guides
 * of deeper levels terminate correctly — without it a three-level chart reads
 * as though every branch continues forever.
 */
function renderNodes(nodes, prefix, lines) {
  nodes.forEach((node, index) => {
    const is_last = index === nodes.length - 1;
    const connector = is_last ? '└── ' : '├── ';

    lines.push(prefix + connector + label(node));

    if (node.children?.length) {
      renderNodes(node.children, prefix + (is_last ? '    ' : '│   '), lines);
    }
  });
}

function label(node) {
  const parts = [node.name];

  if (node.is_group) parts.push('[group]');
  if (node.source === 'system') parts.push(`(key: ${node.source_ref})`);
  else if (node.source_ref) parts.push(`(${node.source_ref})`);

  parts.push(`· ${node.type}`);

  if (node.status !== 'active') parts.push(`· ${node.status}`);

  return parts.join(' ');
}
