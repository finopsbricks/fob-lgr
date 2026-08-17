/**
 * Shared formatting helpers for CLI output.
 *
 * Structured text readable by both humans and LLMs, per the CLI standard's
 * reference set (engineering-standards/cli/output-formatting.md).
 */

/**
 * Format a label: value field with an aligned label.
 */
export function formatField(label, value, labelWidth = 0) {
  const padded = (label + ':').padEnd(labelWidth || label.length + 1);
  return `${padded}  ${value ?? '—'}`;
}

/**
 * Format a table with dynamic column widths.
 *
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {{ align?: Array<'left'|'right'> }} [options]
 */
export function formatTable(headers, rows, options = {}) {
  if (rows.length === 0) {
    return headers.join('  ') + '\n(none)';
  }

  const align = options.align ?? [];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length)),
  );

  const pad = (text, width, i) =>
    align[i] === 'right' ? text.padStart(width) : text.padEnd(width);

  const headerLine = headers.map((h, i) => pad(h, widths[i], i)).join('  ');
  const separator = '-'.repeat(headerLine.length);
  const dataLines = rows.map((row) =>
    row.map((cell, i) => pad(cell || '—', widths[i], i)).join('  '),
  );

  return [headerLine, separator, ...dataLines].join('\n');
}

/** Format rows as RFC-4180 CSV. */
export function formatCsv(headers, rows) {
  const escape = (value) => {
    if (value == null) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\r\n');
}

/**
 * Format a minor-unit integer for display: 150000 → "1,500.00".
 *
 * Display only. Nothing sends a converted value back to the API — amounts cross
 * the wire as the integers they are stored as, so a rounding artefact here can
 * never become a rounding artefact in the ledger.
 *
 * Returns '' for null, undefined or zero, so a table of entries shows a blank
 * in the column that does not apply rather than a column of 0.00 competing for
 * attention with the figures that matter.
 */
export function formatAmount(minorUnits) {
  if (minorUnits == null || minorUnits === '' || Number(minorUnits) === 0) return '';

  return (Number(minorUnits) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a signed minor-unit total, keeping the sign visible.
 *
 * Unlike `formatAmount` this renders zero as "0.00": a balance of exactly zero
 * is a real and interesting answer — it is what a clearing account should show
 * at a summary posting date — and blanking it would hide the thing being
 * checked.
 */
export function formatBalance(minorUnits) {
  if (minorUnits == null || minorUnits === '') return '—';

  return (Number(minorUnits) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format an ISO timestamp as "2026-03-15 10:23:01". */
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
}

/** One-line hint shown under a list when there are more pages. */
export function formatPaginationHint(pageContext) {
  if (!pageContext?.has_more) return null;
  return `(showing ${pageContext.count} of ${pageContext.total} — page ${pageContext.page}; use --page ${pageContext.page + 1} for more)`;
}

/** Format a section divider. */
export function formatSection(title) {
  return `\n--- ${title} ---\n`;
}
