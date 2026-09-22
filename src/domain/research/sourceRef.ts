/**
 * 真实数据来源的 UI 契约（V4 §五十三–§五十五）。
 *
 * 前端必须把两件事分开：
 *   - `SourceRef`：用户真正关心的**数据来源**（机构 / 数据集 / 链接 / 访问日期 / 类型）；
 *   - `LineageRef`：只对研究者有意义的**技术血缘**（artifact / table / figure 文件名）。
 *
 * §五十四：正式 UI 只展示 Source；血缘只在开发模式或技术折叠区出现。
 * §五十五：索引没有声明来源时**绝不猜网站**，也不显示"来源未在当前前端索引中声明"
 *          这类开发文案；正式界面不显示来源块，或如实显示「来源待补充」。
 */

export type SourceType = 'official' | 'reanalysis' | 'statistics' | 'other';

export interface SourceRef {
  organization: string;
  dataset?: string;
  title?: string;
  url?: string;
  accessedAt?: string;
  type: SourceType;
}

export interface LineageRef {
  artifact?: string;
  table?: string;
  figure?: string;
}

const SOURCE_TYPES: readonly string[] = ['official', 'reanalysis', 'statistics', 'other'];

/** 索引里可能出现的来源声明。字段尚未标准化，因此逐字段校验后再采用。 */
export interface RawSourceDecl {
  organization?: string;
  dataset?: string;
  title?: string;
  url?: string;
  accessedAt?: string;
  accessed_at?: string;
  type?: string;
}

/**
 * 只接受"信息完整到可以如实呈现"的声明：
 * 缺 organization 的一律丢弃（宁可显示「来源待补充」，也不猜机构名）。
 * type 不在受控枚举内时归为 other，而不是丢弃整条来源。
 */
export function toSourceRefs(raw: RawSourceDecl[] | undefined | null): SourceRef[] {
  if (!Array.isArray(raw)) return [];
  const refs: SourceRef[] = [];
  for (const entry of raw) {
    const organization = typeof entry?.organization === 'string' ? entry.organization.trim() : '';
    if (!organization) continue;
    const type = typeof entry.type === 'string' && SOURCE_TYPES.includes(entry.type)
      ? (entry.type as SourceType)
      : 'other';
    refs.push({
      organization,
      dataset: entry.dataset?.trim() || undefined,
      title: entry.title?.trim() || undefined,
      url: entry.url?.trim() || undefined,
      accessedAt: (entry.accessedAt ?? entry.accessed_at)?.trim() || undefined,
      type,
    });
  }
  return refs;
}

/** `sourceOfTruth` 里的文件名是血缘，不是来源（§五十三）。 */
export function toLineage(sourceOfTruth: Record<string, string> | undefined | null): LineageRef[] {
  if (!sourceOfTruth) return [];
  return Object.values(sourceOfTruth).filter(Boolean).map((artifact) => ({ artifact }));
}

const reportedMissing = new Set<string>();

/**
 * 开发期登记缺失的 SourceRef（§五十五）。
 * 同一 scope 只报一次，避免刷屏；正式构建不输出任何东西。
 */
export function reportMissingSource(scope: string): void {
  if (!import.meta.env.DEV || reportedMissing.has(scope)) return;
  reportedMissing.add(scope);
  console.info(`Missing SourceRef: ${scope}`);
}
