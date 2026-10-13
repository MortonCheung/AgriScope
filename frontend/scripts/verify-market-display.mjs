/** The homepage bootstrap must remain the same complete publication as the API. */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = await readFile(resolve(frontend, 'src/domain/market/publishedMarket.json'), 'utf8');
const snapshot = JSON.parse(raw);
const products = ['黄瓜','甘蓝','青椒','尖椒','土豆','西红柿','茄子','大白菜'];
const levels = ['wholesale','supermarket','retail_market'];
const regions = ['shenyang','tieling','chaoyang','jinzhou','dandong','dalian','liaoning'];
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
if (snapshot.schema_version !== '1' || !Array.isArray(snapshot.records) || snapshot.records.length !== 168
  || JSON.stringify(snapshot.products) !== JSON.stringify(products) || JSON.stringify(snapshot.price_levels) !== JSON.stringify(levels)) throw new Error('Invalid market publication contract.');
const keys = new Set();
for (const row of snapshot.records) {
  const key = `${row.region}:${row.product}:${row.price_level}`;
  if (!regions.includes(row.region) || !products.includes(row.product) || !levels.includes(row.price_level)
    || keys.has(key) || !positive(row.price) || !day(row.observation_date) || !Number.isFinite(row.change_percent)
    || typeof row.collectedAt !== 'string' || !Number.isFinite(Date.parse(row.collectedAt))
    || !Array.isArray(row.history) || !row.history.length || row.history.length > 4) throw new Error(`Invalid market publication: ${key}`);
  keys.add(key);
  let previous = '';
  for (const point of row.history) {
    if (!day(point.date) || point.date <= previous || !positive(point.price)) throw new Error(`Invalid market history: ${key}`);
    previous = point.date;
  }
  const last = row.history.at(-1), prior = row.history.at(-2);
  if (last.date !== row.observation_date || last.price !== row.price
    || Math.abs((prior ? (last.price/prior.price-1)*100 : 0)-row.change_percent) > .0001) throw new Error(`Market readings disagree: ${key}`);
}
const runtime = resolve(frontend, '../runtime/data/market/display.json');
if (existsSync(runtime) && raw !== await readFile(runtime, 'utf8')) throw new Error('Frontend and API market publications differ.');
console.log(`[verify-market-display] ${keys.size} complete combinations verified; sha256=${createHash('sha256').update(raw).digest('hex')}`);
