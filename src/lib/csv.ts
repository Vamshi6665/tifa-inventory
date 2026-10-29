export type Cell = string | number | boolean | null | undefined | Date;

/**
 * Spreadsheet apps execute cells that start with = + - @ (CSV/formula injection).
 * Item names and notes are user-entered, so they're neutralised with a leading quote.
 */
export function sanitizeCell(value: Cell): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function escape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCSV(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [headers.map((h) => escape(sanitizeCell(h)))];
  for (const row of rows) lines.push(row.map((c) => escape(sanitizeCell(c))));
  // BOM so Excel opens UTF-8 correctly (accented flavour names).
  return '﻿' + lines.map((l) => l.join(',')).join('\r\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV(filename: string, headers: readonly string[], rows: readonly (readonly Cell[])[]): void {
  downloadBlob(new Blob([toCSV(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Lazy-loaded so the xlsx writer only downloads when someone exports. */
export async function downloadXLSX(filename: string, sheets: Array<{ name: string; headers: readonly string[]; rows: readonly (readonly Cell[])[] }>): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const payload = sheets.map((s) => ({
    sheet: safeSheetName(s.name),
    stickyRowsCount: 1,
    data: [
      s.headers.map((h) => ({ value: h, fontWeight: 'bold' })),
      ...s.rows.map((r) =>
        r.map((c) => {
          if (c == null) return null;
          if (typeof c === 'number' || typeof c === 'boolean') return c;
          if (c instanceof Date) return { value: c, format: 'yyyy-mm-dd' };
          return sanitizeCell(c);
        }),
      ),
    ],
  }));
  const blob = await writeExcelFile(payload as never).toBlob();
  downloadBlob(blob, filename);
}

export function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
}

export function fileStamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
