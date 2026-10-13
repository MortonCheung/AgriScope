// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import catalogJson from '../../../../runtime/research/research_catalog.json';
import type { V2Catalog } from '../../domain/research/v2/types';
import { resetAppContext } from '../../app/context/appContext';
import { CityReportTree } from './CityReportTree';

const catalog = catalogJson as unknown as V2Catalog;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
const open = (url = '/reports') => render(<MemoryRouter initialEntries={[url]}><CityReportTree catalog={catalog}/><Location/></MemoryRouter>);
beforeEach(() => { resetAppContext(); vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})); });
afterEach(() => { cleanup();vi.unstubAllGlobals(); });
describe('one city/topic/point tree consumes the verified publication', () => {
  it('city disclosure does not navigate; selecting a valid topic carries real conditions', () => {
    open('/reports?crop=玉米&horizon=14&as_of=2026-10-06');
    const city = screen.getByRole('button',{name:'铁岭'});
    fireEvent.click(city);
    expect(screen.getByTestId('location').textContent).toBe('/reports?crop=玉米&horizon=14&as_of=2026-10-06');
    const panel=document.getElementById(city.getAttribute('aria-controls')!)!;
    expect(within(panel).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(within(panel).getByRole('button',{name:'铁岭市农业生产结构与变化'}));
    const location=screen.getByTestId('location').textContent!;
    expect(location).toContain('/reports/tieling?');
    const params=new URLSearchParams(location.split('?')[1]);
    expect(Object.fromEntries(params)).toMatchObject({city:'tieling',research:'A7',crop:'玉米',horizon:'14',as_of:'2026-10-06'});
  });
  it('opens the current city and offers only real accepted points, including valid negative conclusions', () => {
    const {container}=open('/reports/shenyang?research=A3.10');
    const city=screen.getByRole('button',{name:'沈阳'});
    expect(city.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('.tree__topic')).toHaveLength(8);
    expect(screen.queryByText('A4.4')).toBeNull();
    expect(screen.queryByText(catalog.cities.find(city=>city.city==='shenyang')!.modules[0].presentation!.excluded_point_ids[0])).toBeNull();
    expect(screen.getByText('A3.10')).toBeTruthy();
    fireEvent.click(city);
    expect(city.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('location').textContent).toContain('/reports/shenyang');
  });
  it('does not advertise a city when publication metadata is missing', () => {
    render(<MemoryRouter><CityReportTree catalog={{...catalog,presentation_version:undefined}}/></MemoryRouter>);
    for(const button of document.querySelectorAll('.city-report-tree__toggle'))expect(button.hasAttribute('disabled')).toBe(true);
  });
});
