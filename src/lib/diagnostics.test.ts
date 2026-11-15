import { describe, expect, it, vi } from 'vitest';
import {
  currentProblems,
  diagnostics,
  diagnosticsText,
  record,
  report,
  setProblem,
} from './diagnostics';

describe('diagnostics', () => {
  it('logs errors with where they happened, and keeps the last 100', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    report('code sync', new Error('labelOf is not defined'), { nodes: 3 });
    const last = diagnostics().at(-1)!;
    expect(last).toMatchObject({
      where: 'code sync',
      message: 'labelOf is not defined',
      detail: { nodes: 3 },
    });
    expect(last.stack).toContain('labelOf is not defined');
    for (let i = 0; i < 150; i++) record({ where: 'test', message: `${i}` });
    expect(diagnostics()).toHaveLength(100);
    expect(diagnosticsText()).toContain('[test] 149');
  });
  it('keeps problems until they are cleared', () => {
    setProblem('code sync', 'The code is behind');
    expect(currentProblems()).toEqual(['The code is behind']);
    setProblem('code sync', null);
    expect(currentProblems()).toEqual([]);
  });
});
