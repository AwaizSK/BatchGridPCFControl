import * as React from "react";

/**
 * Left/Right only leave a cell when the caret is at the edge (or the whole text is selected),
 * so text editing still works. Up/Down/Enter/Tab always move.
 */
export function useGridNavigation(
  gridRef: React.RefObject<HTMLElement>, colCount: number,
  rowCountRef: React.MutableRefObject<number>, addRow: () => void,
) {
  const pendingFocus = React.useRef<[number, number] | null>(null);

  const focusCell = React.useCallback((r: number, c: number) => {
    const el = gridRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]:not(:disabled)`);
    if (el) { el.focus(); el.select(); }
  }, [gridRef]);

  const go = React.useCallback((r: number, c: number) => {
    if (r < 0) return;
    if (r >= rowCountRef.current) { pendingFocus.current = [r, c]; addRow(); return; }
    focusCell(r, c);
  }, [addRow, focusCell, rowCountRef]);

  const flushPendingFocus = React.useCallback(() => {
    if (pendingFocus.current) { focusCell(pendingFocus.current[0], pendingFocus.current[1]); pendingFocus.current = null; }
  }, [focusCell]);

  const onKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.nativeEvent.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.currentTarget;
    const last = colCount - 1;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); go(r + 1, c); break;
      case "ArrowUp":   e.preventDefault(); go(r - 1, c); break;
      case "Enter":     e.preventDefault(); go(e.shiftKey ? r - 1 : r + 1, c); break;
      case "ArrowRight":
        if (!e.shiftKey && el.selectionEnd === el.value.length && c < last) { e.preventDefault(); go(r, c + 1); }
        break;
      case "ArrowLeft":
        if (!e.shiftKey && el.selectionStart === 0 && c > 0) { e.preventDefault(); go(r, c - 1); }
        break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) { if (c > 0) go(r, c - 1); else go(r - 1, last); }
        else if (c < last) go(r, c + 1); else go(r + 1, 0);
        break;
    }
  }, [colCount, go]);

  return { onKeyDown, flushPendingFocus };
}