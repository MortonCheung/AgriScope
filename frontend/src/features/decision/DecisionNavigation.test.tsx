// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DecisionPage } from './DecisionPage';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';

vi.mock('./PlanningWorkbench', () => ({ PlanningWorkbench: ({ cityId }: { cityId: string }) => <section>{cityId}</section> }));
function RouteProbe() { const location = useLocation(); return <output aria-label="当前地址">{location.pathname}{location.search}</output>; }
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('decision city selection remains inside each stable link', () => {
  it('applies each selection without waiting, retaining city links, sidebar and paper through 20 clicks', () => {
    const { container } = render(<MemoryRouter initialEntries={['/cities/shenyang/decision?city=shenyang']}><RouteProbe/><Routes><Route path="/cities/:cityId/decision" element={<DecisionPage/>}/></Routes></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: '决策城市' });
    const links = within(nav).getAllByRole('link');
    const sidebar = container.querySelector('.workbench__sidebar');
    const paper = container.querySelector('.workbench__paper');
    for (let index = 0; index < 20; index++) {
      const cityId = STUDY_CITY_IDS[index % STUDY_CITY_IDS.length];
      const cityLink = within(nav).getByRole('link', { name: getCity(cityId)!.shortName });
      fireEvent.click(cityLink);
      expect(screen.getByLabelText('当前地址').textContent).toBe(`/cities/${cityId}/decision?city=${cityId}`);
      expect(cityLink.getAttribute('aria-current')).toBe('page');
      expect(within(nav).getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
      expect(within(nav).getAllByRole('link')).toEqual(links);
      expect(container.querySelector('.workbench__sidebar')).toBe(sidebar);
      expect(container.querySelector('.workbench__paper')).toBe(paper);
    }
    expect(nav.classList.contains('decision-city-navigation')).toBe(true);
  });
});
