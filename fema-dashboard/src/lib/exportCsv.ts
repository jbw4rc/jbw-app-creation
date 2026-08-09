/** Every queue exports to CSV. The team lives in Excel — feed it, don't fight it. */

function escapeCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, columns: string[], rows: Array<Array<string | number>>) {
  const csv = [columns, ...rows].map((r) => r.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
