import type { ResearchPoint, ResearchTopic } from '../../domain/research/catalog';
import { quoteLabel } from '../../domain/research/catalog/labels';
import { ResearchQuote } from './blocks';
import { ResearchDataModule } from './interactive/InteractiveModuleRegistry';

/**
 * 交互研究视图（本轮 §15/§30）。
 *
 * 对象是**一个具体研究点**（A2.2），不是全文：
 *   一层：研究点标识与标题（结构，研究侧冻结）
 *   二层：数据模块 —— 研究表的真实数字 + 研究侧原句
 *   三层（unsupported）：研究侧判定 + 原句
 *
 * §30：这里**不再**出现"方法与结论…打开原文 →"之类的重复入口 ——
 * 交互研究 / 原文的切换只有顶部那一条常驻切换条（§29）。
 */
export function InteractivePointView({ cityId, point, topic }: {
  cityId: string;
  point: ResearchPoint;
  topic: ResearchTopic;
}) {
  const citations = point.citations ?? [];

  return (
    <div className="research__main" data-animate="in">
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
            <ResearchQuote
              key={index}
              quote={citation.quote}
              cite={quoteLabel(point.articleId, citation.section)}
            />
          ))}
        </section>
      )}

      {point.status === 'ready' && point.binding && point.module && (
        <section className="research__block">
          <h2 className="research__block-title">研究数据</h2>
          <ResearchDataModule cityId={cityId} point={point} binding={point.binding} citations={citations} />
        </section>
      )}
    </div>
  );
}
