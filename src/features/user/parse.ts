// 批量导入用户：解析 jsonl / CSV → 行 + 逐行校验。零依赖（CSV 自己解析，处理引号 / 逗号转义）。
// 批量导入一律创建为「非系统管理员」（isSystemAdmin 固定 false），故不解析该字段、示例也不含它。
import type { CreateUserRequest } from './types';

export interface ParsedUserRow extends CreateUserRequest {
  /** 数据行号（1-based，便于用户对照文件改）。 */
  rowNumber: number;
  /** 该行校验错误；无错为 undefined。 */
  error?: string;
}

const REQUIRED = ['username', 'displayName', 'password'] as const;

function validate(
  rowNumber: number,
  raw: { username?: unknown; displayName?: unknown; password?: unknown },
): ParsedUserRow {
  const username = String(raw.username ?? '').trim();
  const displayName = String(raw.displayName ?? '').trim();
  const password = String(raw.password ?? '').trim();
  const missing = REQUIRED.filter((k) => !String(raw[k] ?? '').trim());
  return {
    rowNumber,
    username,
    displayName,
    password,
    isSystemAdmin: false, // 批量导入固定非系统管理员
    error: missing.length ? `缺少必填：${missing.join(' / ')}` : undefined,
  };
}

function parseJsonl(text: string): ParsedUserRow[] {
  const out: ParsedUserRow[] = [];
  let n = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    n += 1;
    try {
      out.push(validate(n, JSON.parse(t)));
    } catch {
      out.push({
        rowNumber: n,
        username: '',
        displayName: '',
        password: '',
        isSystemAdmin: false,
        error: '不是合法 JSON',
      });
    }
  }
  return out;
}

/** CSV → 二维数组，处理引号包裹、字段内逗号/换行、转义双引号 ""。 */
function csvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsv(text: string): ParsedUserRow[] {
  const clean = text.replace(/^﻿/, ''); // 去掉 Excel 的 UTF-8 BOM
  const rows = csvToRows(clean).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const missingHeaders = REQUIRED.filter((h) => idx(h) < 0);
  if (missingHeaders.length) {
    throw new Error(`CSV 缺少表头列：${missingHeaders.join(' / ')}`);
  }
  const ui = idx('username');
  const di = idx('displayName');
  const pi = idx('password');
  return rows
    .slice(1)
    .map((r, i) => validate(i + 1, { username: r[ui], displayName: r[di], password: r[pi] }));
}

/** 解析上传文件（按扩展名走 jsonl / CSV）。表头/格式整体错误时抛出。 */
export function parseUsersFile(fileName: string, text: string): ParsedUserRow[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jsonl')) return parseJsonl(text);
  if (lower.endsWith('.csv')) return parseCsv(text);
  throw new Error('仅支持 .jsonl 或 .csv 文件');
}

/** 示例文件内容（供「下载示例」）。CSV 带 BOM 保证中文在 Excel 不乱码。不含 isSystemAdmin。 */
export const SAMPLE_JSONL =
  '{"username":"liuyi","displayName":"刘一","password":"Init@1234"}\n' +
  '{"username":"chener","displayName":"陈二","password":"Init@1234"}\n';

export const SAMPLE_CSV =
  '﻿username,displayName,password\n' + 'liuyi,刘一,Init@1234\n' + 'chener,陈二,Init@1234\n';
