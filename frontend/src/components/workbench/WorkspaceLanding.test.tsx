// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CityWorkspaceSelector, WorkspaceLanding, WorkspaceLink } from './WorkspaceLanding';

afterEach(cleanup);
it('keeps one semantic city list, real destinations, current and unavailable states', () => {
  render(<MemoryRouter><WorkspaceLanding title="农业决策"><nav aria-label="选择决策城市">
    <CityWorkspaceSelector buildHref={id => `/cities/${id}/decision`} selectedCityId="shenyang" available={id => id !== 'dalian'}/>
  </nav></WorkspaceLanding></MemoryRouter>);
  expect(screen.getByRole('heading', { name: '农业决策' })).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(6);
  expect(screen.getByRole('link', { name: '沈阳' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: '锦州' }).getAttribute('href')).toBe('/cities/jinzhou/decision');
  expect((screen.getByRole('button', { name: '大连' }) as HTMLButtonElement).disabled).toBe(true);
});
it('retains each link underline while a local group owns its selected background', () => {
  const view = (current: boolean) => <MemoryRouter><WorkspaceLink selectionValue="shenyang" to="/cities/shenyang/decision" aria-current={current ? 'page' : undefined}>沈阳</WorkspaceLink></MemoryRouter>;
  const rendered = render(view(true));
  const link = screen.getByRole('link', { name: '沈阳' });
  const underline = link.querySelector('.ag-underline');
  expect(underline?.getAttribute('data-active')).toBe('true');
  rendered.rerender(view(false));
  expect(link.querySelector('.ag-underline')).toBe(underline);
  expect(underline?.hasAttribute('data-active')).toBe(false);
  rendered.rerender(view(true));
  expect(link.querySelectorAll('.ag-underline')).toHaveLength(1);
  expect(underline?.getAttribute('data-active')).toBe('true');
});
