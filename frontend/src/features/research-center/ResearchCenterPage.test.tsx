// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import type { V2Catalog } from '../../domain/research/v2/types';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { resetAppContext } from '../../app/context/appContext';
import { ResearchCenterPage } from './ResearchCenterPage';
vi.mock('../../domain/research/runtime/catalog', async importOriginal => ({...await importOriginal<typeof import('../../domain/research/runtime/catalog')>(), useRuntimeCatalog: vi.fn()}));
vi.mock('./LlmEvidenceSection', () => ({LlmEvidenceSection: () => <p>FORMAL_MODEL_EVIDENCE</p>}));
const catalog: V2Catalog = {schema_version:'2',generated_by:'test',n_cities:6,n_modules:6,cities:STUDY_CITY_IDS.map(city=>({city,city_name:getCity(city)!.shortName,n_modules:1,modules:[{module_id:'A09',title:'report',status:'ACCEPTED',summary:null,article_path:'article.json',explorer_available:false,tables:[],figures:[],sources:[]}]}))};
beforeEach(()=>{resetAppContext(); vi.stubGlobal('matchMedia',()=>({matches:false}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const open=()=>render(<MemoryRouter><ResearchCenterPage/></MemoryRouter>);
describe('direct report entry with scientific catalog boundaries',()=>{
  it('offers exactly six city buttons leading to formal reports, and keeps model evidence behind disclosure',()=>{
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'ready',catalog});
    const {container}=open();
    const links=within(screen.getByRole('navigation',{name:'城市报告'})).getAllByRole('link');
    expect(links.map(link=>link.textContent?.replace('↗',''))).toEqual(STUDY_CITY_IDS.map(id=>getCity(id)!.shortName));
    links.forEach((link,index)=>expect(link.getAttribute('href')).toBe(`/reports/${STUDY_CITY_IDS[index]}?city=${STUDY_CITY_IDS[index]}`));
    expect(container.textContent).not.toMatch(/进入研究|研究模块|策展树|证据链/);
    expect(container.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(container.querySelector('details')?.textContent).toContain('FORMAL_MODEL_EVIDENCE');
  });
  it('never creates report links during loading, error, or a city catalog without a formal A09',()=>{
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'loading'});
    const rendered=open();
    expect(within(screen.getByRole('navigation',{name:'城市报告'})).queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button').every(button=>button.hasAttribute('disabled'))).toBe(true);
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'error',message:'offline'});
    rendered.rerender(<MemoryRouter><ResearchCenterPage/></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toContain('offline');
    vi.mocked(useRuntimeCatalog).mockReturnValue({status:'ready',catalog:{...catalog,cities:catalog.cities.map(city=>city.city==='shenyang'?{...city,modules:[]}:city)}});
    rendered.rerender(<MemoryRouter><ResearchCenterPage/></MemoryRouter>);
    expect(screen.getByRole('button',{name:'沈阳'}).hasAttribute('disabled')).toBe(true);
    expect(within(screen.getByRole('navigation',{name:'城市报告'})).getAllByRole('link')).toHaveLength(5);
  });
});
