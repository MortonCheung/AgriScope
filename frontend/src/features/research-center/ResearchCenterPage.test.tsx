// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import runtimeCatalog from '../../../../runtime/research/research_catalog.json';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import type { V2Catalog } from '../../domain/research/v2/types';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { resetAppContext } from '../../app/context/appContext';
import { ResearchCenterPage } from './ResearchCenterPage';
vi.mock('../../domain/research/runtime/catalog', async importOriginal => ({...await importOriginal<typeof import('../../domain/research/runtime/catalog')>(), useRuntimeCatalog: vi.fn()}));

const catalog = runtimeCatalog as unknown as V2Catalog;
beforeEach(()=>{resetAppContext(); vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const renderedCityLinks=()=>document.querySelectorAll('.report-navigation__cities a');
const open=()=>render(<MemoryRouter initialEntries={['/reports']}><ResearchCenterPage/></MemoryRouter>);
describe('direct report entry with scientific catalog boundaries',()=>{
  it('offers six city reports directly in one workspace without model or duplicate city entrances',()=>{
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'ready',catalog});
    const {container}=open();
    const links=[...container.querySelectorAll('.report-navigation__cities a')];
    expect(links.map(link=>link.textContent?.replace('↗',''))).toEqual(STUDY_CITY_IDS.map(id=>getCity(id)!.shortName));
    links.forEach((link,index)=>expect(link.getAttribute('href')).toBe(`/reports/${STUDY_CITY_IDS[index]}?city=${STUDY_CITY_IDS[index]}`));
    expect(container.textContent).not.toMatch(/进入研究|研究模块|策展树|证据链/);
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('.workbench__paper')).toBeTruthy();
    expect(container.querySelector('.workbench__sidebar')?.childElementCount).toBe(0);
    expect(container.querySelectorAll('.report-navigation__cities')).toHaveLength(1);
  });
  it('never creates report links during loading, error, or a city catalog without a formal A09',()=>{
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'loading'});
    const rendered=open();
    expect(renderedCityLinks()).toHaveLength(0);
    expect([...document.querySelectorAll('.report-navigation__cities button')].every(button=>button.hasAttribute('disabled'))).toBe(true);
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'error',message:'offline'});
    rendered.rerender(<MemoryRouter><ResearchCenterPage/></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toContain('报告目录读取失败');
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'ready',catalog:{...catalog,cities:catalog.cities.map(city=>city.city==='shenyang'?{...city,modules:[]}:city)}});
    rendered.rerender(<MemoryRouter><ResearchCenterPage/></MemoryRouter>);
    expect(screen.getByRole('button',{name:'沈阳'}).hasAttribute('disabled')).toBe(true);
    expect(renderedCityLinks()).toHaveLength(5);
  });
});
