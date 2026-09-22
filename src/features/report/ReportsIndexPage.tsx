import { Link } from 'react-router-dom';
import { LIAONING_CITIES } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import './reports.css';

/**
 * 报告目录（V5 §39/§40）。
 *
 * 编辑式目录，不是 Dashboard：编号 + 城市 + 报告全称。
 * §41：只把**真实完成**的报告做成链接；其余城市如实列名但不链接，
 * 也不写「开发中 / Coming soon」。
 */
const PUBLISHED: Record<string, string> = {
  shenyang: '沈阳市农业气象风险、生产响应与农产品市场表现综合研究',
};

export function ReportsIndexPage() {
  const studyCities = LIAONING_CITIES
    .filter((city) => city.studyOrder <= 6)
    .sort((a, b) => a.studyOrder - b.studyOrder);

  return (
    <main className="reports">
      <header className="reports__head">
        <h1 className="reports__title">研究报告</h1>
      </header>
      <ol className="reports__list">
        {studyCities.map((city, index) => {
          const published = PUBLISHED[city.id];
          return (
            <li className="reports__item" key={city.id} data-published={published || undefined}>
              <span className="reports__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="reports__city">{city.shortName}</span>
              {published ? (
                <Link className="reports__name" to={ROUTES.cityReport(city.id)}>{published}</Link>
              ) : (
                <span className="reports__name reports__name--pending">—</span>
              )}
            </li>
          );
        })}
        <li className="reports__item" data-published="liaoning">
          <span className="reports__index">07</span>
          <span className="reports__city">综合</span>
          <span className="reports__name reports__name--pending">辽宁六城综合研究</span>
        </li>
      </ol>
    </main>
  );
}
