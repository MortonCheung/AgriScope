// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { listTopics } from '../../domain/research/catalog';
import { ResearchTree } from './ResearchTree';

const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', async importOriginal => ({ ...await importOriginal<typeof import('motion/react')>(), useReducedMotion: () => preferences.reduced }));
const topics = listTopics('shenyang').slice(0, 2);
afterEach(() => { cleanup(); preferences.reduced = false; });

describe('research sidebar feedback preserves interaction identity', () => {
  it.each([false, true])('immediately disables closing point controls and reopens the same disclosure id (reduced=%s)', reduced => {
    preferences.reduced = reduced;
    const select = vi.fn();
    render(<MemoryRouter><ResearchTree cityId="shenyang" topics={topics} variant="picker" onSelect={select}/></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: `${topics[0].id} ${topics[0].title}` });
    const panelId = toggle.getAttribute('aria-controls')!;
    const panel = document.getElementById(panelId)!;
    expect(within(panel).getAllByRole('button')).toHaveLength(topics[0].points.length);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(within(panel).queryByRole('button')).toBeNull();
    fireEvent.click(toggle);
    expect(document.getElementById(panelId)).toBe(panel);
    expect(panel.hasAttribute('inert')).toBe(false);
    const point = topics[0].points[0];
    fireEvent.click(within(panel).getByRole('button', { name: `${point.id} ${point.title}` }));
    expect(select).toHaveBeenLastCalledWith(point.id);
  });
  it('rapid point selections update immediately without replacing topic or point nodes', () => {
    const select = vi.fn();
    const tree = (selectedId?: string) => <MemoryRouter><ResearchTree cityId="shenyang" topics={topics} variant="picker" selectedId={selectedId} onSelect={select}/></MemoryRouter>;
    const opened = render(tree());
    const toggles = [...opened.container.querySelectorAll('.tree__toggle')];
    const points = [...opened.container.querySelectorAll('.tree__point-link')];
    for (const point of topics[0].points.slice(0, 3)) {
      fireEvent.click(screen.getByRole('button', { name: `${point.id} ${point.title}` }));
      expect(select).toHaveBeenLastCalledWith(point.id);
      opened.rerender(tree(point.id));
      expect(screen.getByRole('button', { name: `${point.id} ${point.title}` }).getAttribute('aria-current')).toBe('true');
    }
    expect([...opened.container.querySelectorAll('.tree__toggle')]).toEqual(toggles);
    expect([...opened.container.querySelectorAll('.tree__point-link')]).toEqual(points);
  });
  it('identifies current rail point links and exposes the current branch to keyboards', () => {
    const topic = topics[1]; const point = topic.points[0];
    render(<MemoryRouter><ResearchTree cityId="shenyang" topics={topics} variant="rail" currentTopicId={topic.id} currentPointId={point.id}/></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: `${topic.id} ${topic.title}` });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const link = screen.getByRole('link', { name: `${point.id} ${point.title}` });
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.getAttribute('href')).toBe(`/cities/shenyang/research/${point.id}`);
    expect(link.closest('[inert]')).toBeNull();
  });
});
