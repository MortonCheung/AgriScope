// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CityWorkspaceSelector, WorkspaceLanding } from './WorkspaceLanding';

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
