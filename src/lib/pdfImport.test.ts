import { describe, expect, it } from 'vitest';
import { titleFromRuns } from './pdfImport';

describe('titleFromRuns', () => {
  it('takes the largest text as the title', () => {
    const runs = [
      { str: 'Weather', height: 24 },
      { str: 'extremes', height: 24 },
      { str: 'Rainfall in the UK is up 10% since 1980', height: 14 },
    ];
    expect(titleFromRuns(runs)).toBe('Weather extremes');
  });
  it('returns nothing for pages without text', () => {
    expect(titleFromRuns([])).toBe('');
  });
});
