import { Link } from 'react-router-dom';
import type { ResearchPoint, ResearchTopic } from '../../domain/research/catalog';
import { pointStatusLabel } from '../../domain/research/catalog/labels';
import { ROUTES } from '../../app/routes';
import { ResearchDataModule } from './interactive/InteractiveModuleRegistry';

/**
 * 交互研究视图（本轮 §15）。
 *
 * 对象是**一个具体研究点**（A2.2），不是全文：
 *   一层：研究点标识与标题（结构，研究侧冻结）
 *   二层：数据模块 —— 研究表的真实数字 + 研究侧原句
 *   三层：该点的方法 / 结论未由研究侧提供时不显示空壳，改为指到原文
 *   四层：来源（该方向文章声明的来源）
 */
export function InteractivePointView({ cityId, point, topic }: {
  cityId: string;
  point: ResearchPoint;
  topic: ResearchTopic;
}) {
  const citations = point.citations ?? [];

  return (
    <div className="research__main">
      <header className="research__head">
        <p className="research__id">{point.id}</p>
        <h1 className="research__title">{point.title}</h1>
        <p className="research__article-title">所属方向 {topic.id} · {topic.title}</p>
      </header>

      {point.status === 'pending' && (
        <section className="research__block">
          <h2 className="research__block-title">研究内容待接入</h2>
          {point.reason && <p className="research__paragraph">{point.reason}</p>}
        </section>
      )}

      {point.status === 'unsupported' && (
        <section className="research__block">
          <h2 className="research__block-title">研究侧判定</h2>
          {point.reason && <p className="research__paragraph">{point.reason}</p>}
          {citations.map((citation, index) => (
            <blockquote className="research__quote" key={index}>
              {citation.quote}
              <cite>{point.articleId} §{citation.section}</cite>
            </blockquote>
          ))}
        </section>
      )}

      {point.status === 'ready' && point.binding && point.module && (
        <section className="research__block">
          <h2 className="research__block-title">研究数据</h2>
          <ResearchDataModule cityId={cityId} point={point} binding={point.binding} citations={citations} />
        </section>
      )}

      {point.status === 'ready' && (
        <section className="research__block">
          <p className="research__paragraph">
            方法与结论由研究侧统一写在方向原文中。
            <Link to={`${ROUTES.research(cityId, point.id)}?mode=article`}> 打开 {topic.id} 原文 →</Link>
          </p>
        </section>
      )}
    </div>
  );
}
