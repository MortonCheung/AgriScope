import { Link } from 'react-router-dom';
import { LIAONING_CITIES } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import {cityEntry,useRuntimeCatalog} from '../../domain/research/runtime/catalog';
import './reports.css';

/**
 * 报告目录（V5 §39/§40）。
 *
 * 编辑式目录，不是 Dashboard：编号 + 城市 + 报告全称。
 * §41：只把**真实完成**的报告做成链接；其余城市如实列名但不链接，
 * 也不写「开发中 / Coming soon」。
 */
export function ReportsIndexPage() {
  const catalog=useRuntimeCatalog();
  const published=(city:string,id:string)=>catalog.status==='ready'?cityEntry(catalog.catalog,city)?.modules.find(m=>m.module_id===id):undefined;
  const status=(value:string)=>value==='DRAFT'?'研究稿':value==='ACCEPTED_PENDING_EXTERNAL_REVIEW'?'外审待复核':value==='ACCEPTED'?'已验收':'按原研究状态阅读';
  const studyCities = LIAONING_CITIES
    .filter((city) => city.studyOrder <= 6)
    .sort((a, b) => a.studyOrder - b.studyOrder);

  return (
    <main className="reports">
      <header className="reports__head">
        <h1 className="reports__title">研究报告</h1>
      </header>
      {catalog.status==='error'&&<p role="alert">研究目录读取失败：{catalog.message}</p>}
      <ol className="reports__list">
        {studyCities.map((city, index) => {
          const report = published(city.id,'A09');
          return (
            <li className="reports__item" key={city.id} data-published={report?.status}>
              <span className="reports__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="reports__city">{city.shortName}</span>
              {report ? (
                <Link className="reports__name" to={ROUTES.cityReport(city.id)}>{report.title}<small className="reports__status">{status(report.status)}</small></Link>
              ) : (
                <span className="reports__name reports__name--pending">{catalog.status==='loading'?'读取报告索引…':'暂无已登记报告'}</span>
              )}
            </li>
          );
        })}
        <li className="reports__item" data-published="liaoning">
          <span className="reports__index">07</span>
          <span className="reports__city">综合</span>
          {published('cross_city','A11')?<Link className="reports__name" to={ROUTES.provinceReport}>{published('cross_city','A11')!.title}<small className="reports__status">{status(published('cross_city','A11')!.status)}</small></Link>:<span className="reports__name reports__name--pending">暂无已登记综合研究</span>}
        </li>
      </ol>
    </main>
  );
}
