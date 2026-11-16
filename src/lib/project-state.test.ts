import { describe, expect, it } from 'vitest';
import { getShareUrl, loadFromUrl, type ProjectState } from './project-state';

const state: ProjectState = {
  name: 'Test',
  nodes: [{ id: 'a', type: 'pad-node', position: { x: 0, y: 0 }, data: {} }],
  edges: [],
  cpm: '120',
  bpc: '4',
};

describe('project-state', () => {
  it('round-trips a patch through a share URL', () => {
    const url = getShareUrl(state, 'http://localhost/');
    // Opened in the current save format.
    expect(loadFromUrl(url)).toEqual({ ...state, version: 2 });
  });

  it('rejects edges pointing at unknown nodes', () => {
    const broken = {
      ...state,
      edges: [{ id: 'e', source: 'a', target: 'missing' }],
    };
    expect(loadFromUrl(getShareUrl(broken, 'http://localhost/'))).toBeNull();
  });
});
