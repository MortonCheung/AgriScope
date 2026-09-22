import { NavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createAppHistoryState, recordAppLocation } from './appHistory';

const location = (key: string, pathname: string) => ({ key, pathname });

describe('session app history', () => {
  it('does not trust browser history before the app session started', () => {
    const state = createAppHistoryState(location('deep', '/library/computer/tree/tree-408/point/knowledge-tcp/study'));
    expect(state.index).toBe(0);
    expect(state.entries).toHaveLength(1);
  });

  it('records PUSH entries and truncates an abandoned forward branch', () => {
    const state = createAppHistoryState(location('library', '/library'));
    recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Push);
    recordAppLocation(state, location('study', '/library/computer/tree/tree-408/point/knowledge-tcp/study'), NavigationType.Push);
    recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Pop);
    recordAppLocation(state, location('progress', '/progress'), NavigationType.Push);
    expect(state.entries.map((entry) => entry.key)).toEqual(['library', 'tree', 'progress']);
    expect(state.index).toBe(2);
  });

  it('derives back and forward from known POP keys', () => {
    const state = createAppHistoryState(location('library', '/library'));
    recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Push);
    recordAppLocation(state, location('study', '/library/computer/tree/tree-408/point/knowledge-tcp/study'), NavigationType.Push);
    recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Pop);
    expect(state.direction).toBe(-1);
    recordAppLocation(state, location('study', '/library/computer/tree/tree-408/point/knowledge-tcp/study'), NavigationType.Pop);
    expect(state.direction).toBe(1);
  });

  it('replaces the current entry without creating a new Back target', () => {
    const state = createAppHistoryState(location('legacy', '/teach/unit'));
    recordAppLocation(state, location('canonical', '/library/computer/tree/tree-408/point/knowledge-tcp/teach'), NavigationType.Replace);
    expect(state.entries).toEqual([location('canonical', '/library/computer/tree/tree-408/point/knowledge-tcp/teach')]);
    expect(state.index).toBe(0);
  });

  it('resets trust when a POP key was never observed in this session', () => {
    const state = createAppHistoryState(location('library', '/library'));
    recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Push);
    recordAppLocation(state, location('external', '/progress'), NavigationType.Pop);
    expect(state.entries).toEqual([location('external', '/progress')]);
    expect(state.index).toBe(0);
    expect(state.direction).toBe(0);
  });

  it('marks a semantic fallback REPLACE as a Back transition', () => {
    const state = createAppHistoryState(location('deep', '/library/computer/tree/tree-408/point/knowledge-tcp/study'));
    state.pending = { sourceKey: 'deep', action: NavigationType.Replace, direction: -1 };
    recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Replace);
    expect(state.direction).toBe(-1);
    expect(state.entries).toEqual([location('tree', '/library/computer/tree/tree-408/path')]);
  });

  it('is idempotent when StrictMode observes the same location twice', () => {
    const state = createAppHistoryState(location('library', '/library'));
    const first = recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Push);
    const second = recordAppLocation(state, location('tree', '/library/computer/tree/tree-408/path'), NavigationType.Push);
    expect(second).toBe(first);
    expect(state.entries).toHaveLength(2);
  });
});
