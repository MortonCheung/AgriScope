import { describe, expect, it } from 'vitest';
import { NavigationType } from 'react-router-dom';
import { ROUTES, parseCityPath, structuralParent } from '../../app/routes';
import { getRouteDirection, isSpatialEntry } from '../../app/routeTransitions';
describe('decision extends the existing city hierarchy',()=>{
  it('is a city child, preserving research and province parents',()=>{
    const url=ROUTES.decision('shenyang');expect(url).toBe('/cities/shenyang/decision');
    expect(structuralParent(url)).toBe('/cities/shenyang');expect(structuralParent('/cities/shenyang')).toBe('/liaoning');
    expect(parseCityPath(url)).toBeNull();
  });
  it('uses the existing page transition without becoming a map camera entry',()=>{
    const city=ROUTES.city('shenyang'),decision=ROUTES.decision('shenyang');
    expect(isSpatialEntry(city,decision)).toBe(false);
    expect(getRouteDirection(city,decision,{action:NavigationType.Push})).toBe(1);
    expect(getRouteDirection(decision,city,{action:NavigationType.Pop,popDirection:-1})).toBe(-1);
  });
});
