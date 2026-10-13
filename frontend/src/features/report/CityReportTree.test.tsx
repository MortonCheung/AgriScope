// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import catalogJson from '../../../../runtime/research/research_catalog.json';
import type { V2Catalog } from '../../domain/research/v2/types';
import { resetAppContext } from '../../app/context/appContext';
import { CityReportTree } from './CityReportTree';
import { presentedTopics } from '../../domain/research/presentation';

const motionPreference = vi.hoisted(() => ({ reduced: true }));
vi.mock('motion/react', async importOriginal => ({ ...await importOriginal<typeof import('motion/react')>(), useReducedMotion: () => motionPreference.reduced }));

const catalog = catalogJson as unknown as V2Catalog;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
const open = (url = '/reports') => render(<MemoryRouter initialEntries={[url]}><CityReportTree catalog={catalog}/><Location/></MemoryRouter>);
beforeEach(() => { resetAppContext(); motionPreference.reduced = true; vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})); });
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
  it.each([false, true])('retains city and topic nodes, manual expansion and scroll when collapsing (reduced=%s)', reduced => {
    motionPreference.reduced = reduced;
    open('/reports/shenyang?research=A1.3');
    const city = screen.getByRole('button', { name: '沈阳' });
    const panel = document.getElementById(city.getAttribute('aria-controls')!)!;
    const secondTopic = presentedTopics(catalog, 'shenyang')[1];
    const topic = within(panel).getByRole('button', { name: `${secondTopic.id} ${secondTopic.title}` });
    const topicNode = topic.closest('.tree__topic');
    fireEvent.click(topic);
    expect(topic.getAttribute('aria-expanded')).toBe('true');
    panel.scrollTop = 96;
    fireEvent.click(city);
    expect(document.getElementById(city.getAttribute('aria-controls')!)).toBe(panel);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(within(panel).queryByRole('button')).toBeNull();
    fireEvent.click(city);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(topic.closest('.tree__topic')).toBe(topicNode);
    expect(topic.getAttribute('aria-expanded')).toBe('true');
    expect(panel.scrollTop).toBe(96);
  });
  it('keeps every disclosure id mounted and excludes closed cities from interaction immediately', () => {
    motionPreference.reduced = false;
    open('/reports');
    const city = screen.getByRole('button', { name: '铁岭' });
    const panel = document.getElementById(city.getAttribute('aria-controls')!)!;
    expect(panel.hasAttribute('inert')).toBe(true);
    fireEvent.click(city);
    expect(panel.hasAttribute('inert')).toBe(false);
    fireEvent.click(city);
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    for (const toggle of document.querySelectorAll('.city-report-tree__toggle')) {
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeTruthy();
    }
  });
  it('applies rapid topic selections immediately and keeps all city toggle nodes stable', () => {
    motionPreference.reduced = false;
    const { container } = open('/reports');
    const city = screen.getByRole('button', { name: '沈阳' });
    const cityNodes = [...container.querySelectorAll('.city-report-tree__toggle')];
    fireEvent.click(city);
    const panel = document.getElementById(city.getAttribute('aria-controls')!)!;
    const topics = presentedTopics(catalog, 'shenyang').slice(0, 3);
    for (const topic of topics) {
      fireEvent.click(within(panel).getByRole('button', { name: `${topic.id} ${topic.title}` }));
      expect(new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1]).get('research')).toBe(topic.id);
    }
    expect([...container.querySelectorAll('.city-report-tree__toggle')]).toEqual(cityNodes);
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(screen.getByTestId('location').textContent).toContain('/reports/shenyang?');
  });
});
