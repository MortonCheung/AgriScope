import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { CityResearchPage } from './CityResearchPage';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { getCity } from '../../domain/geography/cities';
import { hasCatalog, researchIdKind } from '../../domain/research/catalog';
import { ROUTES, canonicalResearchId, isLegacyPayloadResearchId } from '../../app/routes';

/** 深链与城市目录共用同一工作台；正式模块与策展研究点各用真实载荷。 */
export function ResearchRoutePage() {
  const { cityId = '', researchId = '' } = useParams();
  const location = useLocation();
  const canonical = canonicalResearchId(researchId);
  const city = getCity(cityId);
  if (isLegacyPayloadResearchId(researchId)) return <Navigate to={`${ROUTES.research(cityId,canonical)}${location.search}`} replace />;
  if (city && (researchIdKind(cityId,canonical) || (!hasCatalog(cityId) && /^A[1-9]$/.test(canonical)))) {
    return <CityResearchPage initialSelection={canonical} initialModuleId={`A0${canonical.slice(1)}`} />;
  }
  return <main className="research"><div className="research__main"><h1 className="research__title">研究条目不存在</h1><p>当前城市没有发布这个研究条目。</p><Link to={cityContextUrl(ROUTES.city(cityId),cityId)}>返回研究目录 →</Link></div></main>;
}
