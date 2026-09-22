import { ROUTES } from '../../app/routes';
import { Link } from 'react-router-dom';
import { EVIDENCE_LEVELS, STATUS_META, EVIDENCE_ORDER, STATUS_ORDER } from '../../domain/research';
import './about.css';

/** 关于：研究定位、证据等级规范、方法学红线。 */
export function AboutPage() {
  return (
    <main className="ag-page ag-container ag-container--prose about-page">
      <header className="ag-stack ag-stack--tight">
        <p className="ag-label">关于</p>
        <h1 className="ag-hero">AgriScope 穹衡</h1>
        <p className="ag-lead">
          面向辽宁农业场景的交互式数据研究产品。核心问题：不同城市的农业与市场如何面对气象风险？
          哪些风险会真正传导、哪些会被市场系统吸收？改变天气条件或市场缓冲条件，可能发生什么？
        </p>
      </header>

      <section className="ag-section">
        <div className="ag-section__head">
          <h2 className="ag-section-title">证据等级</h2>
          <p className="ag-body">证据等级描述结论的来源强度。阴性结果不降级，它同样是正式结论。</p>
        </div>
        <dl className="about-evidence">
          {EVIDENCE_ORDER.map((code) => (
            <div key={code} className="about-evidence__item">
              <dt><span className="about-evidence__code">{code === 'Unsupported' ? '—' : code}</span>{EVIDENCE_LEVELS[code].label}</dt>
              <dd>{EVIDENCE_LEVELS[code].description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ag-section">
        <div className="ag-section__head">
          <h2 className="ag-section-title">研究状态</h2>
        </div>
        <dl className="about-evidence">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="about-evidence__item">
              <dt>{STATUS_META[status].label}</dt>
              <dd>{status === 'null_result' ? '统计上未发现稳定关系；这是对该数据集的正式结论，不等于"证明不存在"。' : '按研究索引中记录的原始状态呈现。'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ag-section">
        <div className="ag-section__head">
          <h2 className="ag-section-title">方法学红线</h2>
          <p className="ag-body">
            以下限制写入了内容层规范，前端不得为了页面效果突破：
          </p>
        </div>
        <ul className="about-redlines">
          {[
            '不把相关性写成因果',
            '不把再分析天气写成沈阳气象站实测',
            '不把成交量写成吨（单位未知，仅相对口径）',
            '不把年度生产数据插值成日度生产数据',
            '不把批发市场蔬菜直接称作沈阳本地产蔬菜',
            '不把算法派生极端天气与官方事件混为一谈',
            '不把实验性情景实验写成可靠预测',
            '不删除阴性结果',
            '不为了页面好看制造不存在的数值',
          ].map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className="ag-section">
        <div className="ag-section__head">
          <h2 className="ag-section-title">内容来源</h2>
          <p className="ag-body">
            前端只读取研究成果，不修改研究结论。数据采集与模型工程位于外部研究工程，
            前端通过同步脚本把研究索引、选定图表与研究正文接入本站。
          </p>
        </div>
        <div className="ag-row">
          <Link className="ag-button" to={ROUTES.city('shenyang')}>沈阳研究空间</Link>
          <Link className="ag-button" to={ROUTES.liaoning}>辽宁省域空间</Link>
        </div>
      </section>
    </main>
  );
}
