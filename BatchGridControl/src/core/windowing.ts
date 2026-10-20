export const DEFAULT_WINDOW_SIZE = 100;

export function clampWindowStart(totalRows: number, start: number, windowSize: number): number {
  if (totalRows <= windowSize) return 0;
  const maxStart = Math.max(0, totalRows - windowSize);
  return Math.min(Math.max(0, start), maxStart);
}

export function getVisibleRange(totalRows: number, start: number, windowSize: number): {
  start: number;
  end: number;
  page: number;
  totalPages: number;
} {
  const safeStart = clampWindowStart(totalRows, start, windowSize);
  const end = Math.min(totalRows, safeStart + windowSize);
  const totalPages = Math.max(1, Math.ceil(totalRows / windowSize));
  const page = Math.max(1, Math.floor(safeStart / windowSize) + 1);
  return { start: safeStart, end, page, totalPages };
}
