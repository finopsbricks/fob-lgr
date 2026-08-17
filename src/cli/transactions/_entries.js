// @ts-check
/**
 * Parsing entries from the command line.
 *
 * A transaction is a set of lines, which a flat flag list cannot express — so
 * `--entry` is repeatable and each occurrence carries one line:
 *
 *   --entry 'account=a1b2c3,debit=500000'
 *   --entry 'account=f6e5d4,credit=500000,memo=August rent'
 *   --entry 'account=a1b2c3,debit=300000,cost_centre=Mumbai'
 *
 * Amounts are integers in minor units — 500000 is Rs 5,000.00. Nothing here
 * accepts decimals, matching the API: rounding would silently move money.
 *
 * Any key that is not a recognised field becomes a dimension, which is what
 * makes `cost_centre=Mumbai` work without the CLI having to know what
 * dimensions an organization uses. That is the same openness the column has.
 *
 * For anything generated rather than typed, `--entries-json` takes the array
 * directly and skips all of this.
 */

const FIELDS = new Set(['account', 'debit', 'credit', 'memo']);

/**
 * @param {string[]} specs - Raw `--entry` values
 * @returns {Array<object>} Entries in the shape the API expects
 */
export function parseEntrySpecs(specs) {
  return specs.map((spec, index) => parseOne(spec, index));
}

function parseOne(spec, index) {
  const entry = { dimensions: {} };

  for (const pair of spec.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      throw new Error(
        `--entry ${index + 1}: '${trimmed}' is not key=value. ` +
          "Example: --entry 'account=a1b2c3,debit=500000'",
      );
    }

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();

    if (key === 'debit' || key === 'credit') {
      entry[key] = parseAmount(value, key, index);
    } else if (FIELDS.has(key)) {
      entry[key] = value;
    } else {
      entry.dimensions[key] = value;
    }
  }

  if (!entry.account) {
    throw new Error(`--entry ${index + 1}: account is required`);
  }

  if (entry.debit === undefined && entry.credit === undefined) {
    throw new Error(`--entry ${index + 1}: one of debit= or credit= is required`);
  }

  if (!Object.keys(entry.dimensions).length) delete entry.dimensions;

  return entry;
}

/**
 * Amounts must be whole minor units.
 *
 * A decimal is refused here rather than passed through, so the message names
 * the flag the user typed. The API would refuse it too, but by then the error
 * refers to an entry index in a payload they never wrote.
 */
function parseAmount(raw, field, index) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `--entry ${index + 1}: ${field}='${raw}' must be a whole number of minor units (paise). ` +
        'Write 150000 for Rs 1,500.00 — decimals are not accepted, because rounding would move money.',
    );
  }

  return Number(raw);
}

/**
 * Collector for commander's repeatable-option form.
 * `--entry a --entry b` → `['a', 'b']`.
 */
export function collectEntry(value, previous = []) {
  return previous.concat([value]);
}
