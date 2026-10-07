/** 极简 CSV 解析：支持引号包裹、逗号与换行、CRLF。研究表格均为规整导出，无需更复杂实现。 */

export interface ParsedCsv {
  columns: string[];
  rows: Record<string, string>[];
}

function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { record.push(field); field = ''; continue; }
    if (char === '\n') { record.push(field); records.push(record); record = []; field = ''; continue; }
    if (char === '\r') continue;
    field += char;
  }
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }
  return records.filter((entry) => entry.length > 1 || (entry.length === 1 && entry[0].length > 0));
}

export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text);
  if (records.length === 0) return { columns: [], rows: [] };
  const columns = records[0].map((column) => column.trim());
  const rows = records.slice(1).map((entry) => {
    const row: Record<string, string> = {};
    columns.forEach((column, index) => { row[column] = (entry[index] ?? '').trim(); });
    return row;
  });
  return { columns, rows };
}

export function numeric(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
