import { describe, it, expect } from '@jest/globals';
import { parseEntrySpecs, collectEntry } from '../src/cli/transactions/_entries.js';

describe('parseEntrySpecs', () => {
  it('parses a debit line', () => {
    expect(parseEntrySpecs(['account=a1b2c3,debit=500000'])).toEqual([
      { account: 'a1b2c3', debit: 500000 },
    ]);
  });

  it('parses a credit line with a memo', () => {
    expect(parseEntrySpecs(['account=f6e5d4,credit=500000,memo=August rent'])).toEqual([
      { account: 'f6e5d4', credit: 500000, memo: 'August rent' },
    ]);
  });

  it('treats unrecognised keys as dimensions', () => {
    // This is what lets `cost_centre=Mumbai` work without the CLI knowing what
    // dimensions an org uses — the same openness the column has.
    expect(parseEntrySpecs(['account=a1,debit=100,cost_centre=Mumbai,project=Rebuild'])).toEqual([
      { account: 'a1', debit: 100, dimensions: { cost_centre: 'Mumbai', project: 'Rebuild' } },
    ]);
  });

  it('omits the dimensions key entirely when there are none', () => {
    const [entry] = parseEntrySpecs(['account=a1,debit=100']);
    expect('dimensions' in entry).toBe(false);
  });

  it('parses a multi-line split', () => {
    const entries = parseEntrySpecs([
      'account=rent,debit=3000000,cost_centre=Mumbai',
      'account=rent,debit=2000000,cost_centre=Delhi',
      'account=bank,credit=5000000',
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[2]).toEqual({ account: 'bank', credit: 5000000 });
  });

  it('tolerates whitespace around keys and values', () => {
    expect(parseEntrySpecs(['account = a1 , debit = 100'])).toEqual([
      { account: 'a1', debit: 100 },
    ]);
  });

  it('keeps values containing spaces intact', () => {
    const [entry] = parseEntrySpecs(['account=a1,debit=100,memo=Paid by NEFT ref 88123']);
    expect(entry.memo).toBe('Paid by NEFT ref 88123');
  });

  describe('refusals', () => {
    it('rejects a decimal amount rather than rounding it', () => {
      expect(() => parseEntrySpecs(['account=a1,debit=1500.50'])).toThrow(/whole number of minor units/);
    });

    it('rejects a negative amount', () => {
      // The ledger has no negative amounts anywhere — the other column is the
      // way to express the other direction.
      expect(() => parseEntrySpecs(['account=a1,debit=-100'])).toThrow(/whole number of minor units/);
    });

    it('rejects a non-numeric amount', () => {
      expect(() => parseEntrySpecs(['account=a1,debit=lots'])).toThrow(/whole number of minor units/);
    });

    it('rejects a pair with no equals sign', () => {
      expect(() => parseEntrySpecs(['account=a1,debit'])).toThrow(/is not key=value/);
    });

    it('requires an account', () => {
      expect(() => parseEntrySpecs(['debit=100'])).toThrow(/account is required/);
    });

    it('requires one of debit or credit', () => {
      expect(() => parseEntrySpecs(['account=a1'])).toThrow(/one of debit= or credit= is required/);
    });

    it('names the offending entry by its position', () => {
      expect(() => parseEntrySpecs(['account=a1,debit=100', 'account=a2'])).toThrow(/--entry 2/);
    });
  });
});

describe('collectEntry', () => {
  it('accumulates repeated flags', () => {
    let acc;
    acc = collectEntry('first');
    acc = collectEntry('second', acc);
    expect(acc).toEqual(['first', 'second']);
  });
});
