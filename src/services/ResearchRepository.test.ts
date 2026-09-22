import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResearchRepository, getResearchArticle, getResearchTable } from './ResearchRepository';

function csvResponse(text: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => text } as unknown as Response;
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResearchRepository 缓存（V4 §四十四/§四十五）', () => {
  it('研究表加载一次即可同步读到，且不会重复请求', async () => {
    const fetchMock = vi.fn(async () => csvResponse('crop, seasonal_index\n土豆, 1.0\n'));
    vi.stubGlobal('fetch', fetchMock);

    expect(ResearchRepository.peekResearchTable('/tables/peek.csv')).toBeNull();

    const table = await getResearchTable('/tables/peek.csv');
    expect(table.columns.map((column) => column.key)).toEqual(['crop', 'seasonal_index']);
    expect(table.rows).toEqual([{ crop: '土豆', seasonal_index: '1.0' }]);
    expect(ResearchRepository.peekResearchTable('/tables/peek.csv')).toBe(table);

    await getResearchTable('/tables/peek.csv');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('加载失败不写入缓存，重试可以成功', async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      return attempt === 1
        ? csvResponse('', false, 500)
        : csvResponse('crop,value\n青椒,2\n');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getResearchTable('/tables/retry.csv')).rejects.toThrow('加载失败 500');
    expect(ResearchRepository.peekResearchTable('/tables/retry.csv')).toBeNull();

    const table = await getResearchTable('/tables/retry.csv');
    expect(table.rows).toEqual([{ crop: '青椒', value: '2' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('研究原文经过适配后进入缓存（内部字段名 heading 已剥离，§四十）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      id: 'G1',
      title: '标题',
      blocks: [
        { heading: '研究问题', lines: ['问题正文'] },
        { heading: '前端一句话', lines: ['一句话正文'] },
      ],
    })));

    const article = await getResearchArticle('shenyang', 'G1');
    expect(article.blocks.map((block) => block.heading)).toEqual(['研究问题', null]);
    expect(ResearchRepository.peekResearchArticle('shenyang', 'G1')).toBe(article);
  });

  it('未命中的 key 返回 null，而不是抛错', () => {
    expect(ResearchRepository.peekResearchArticle('shenyang', 'NOPE')).toBeNull();
    expect(ResearchRepository.peekCityIndex('nowhere')).toBeNull();
  });
});
