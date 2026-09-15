export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;

  return `${(kb / 1024).toFixed(1)} MB`;
}
