import { CellMap, ColumnConfig, GridRow } from "./types";
import { KindContext } from "./kinds";
import { validateRow } from "./validation";
import { newGuid } from "./guid";

export interface GridState { rows: GridRow[]; saving: boolean; log: string[]; info: string; }
export const INITIAL_STATE: GridState = { rows: [], saving: false, log: [], info: "" };

export type GridAction =
  | { type: "HYDRATE"; rows: GridRow[] }
  | { type: "PASTE"; startRow: number; startCol: number; data: string[][] }
  | { type: "EDIT"; key: string; field: string; value: string }
  | { type: "ADD_ROW" }
  | { type: "TOGGLE_DELETE"; key: string }
  | { type: "LOOKUPS_RESOLVED" }
  | { type: "NOTICE"; log: string[] }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCEEDED" }
  | { type: "SAVE_FAILED"; log: string[]; rowErrors: Record<string, string> };

export const isBlankRow = (row: GridRow): boolean =>
  !row.id && Object.keys(row.values).every(k => !row.values[k].trim());

export const selectDirty = (rows: GridRow[]): GridRow[] =>
  rows.filter(r => r.state !== "clean" && !isBlankRow(r));

const isChanged = (row: GridRow, cols: ColumnConfig[]): boolean =>
  cols.some(c => (row.values[c.field] ?? "").trim() !== (row.original?.[c.field] ?? "").trim());

export function createGridReducer(ctx: KindContext) {
  const { config, cache } = ctx;

  const blankRow = (): GridRow => {
    const values: CellMap = {};
    config.columns.forEach(c => { values[c.field] = ""; });
    return { key: newGuid(), state: "new", values, lookupIds: {}, errors: {}, display: {}, pending: false };
  };

  const finalize = (row: GridRow): GridRow => {
    if (isBlankRow(row)) {                       // untouched spare rows are never validated or saved
      return { ...row, state: "new", errors: {}, display: {}, pending: false, serverError: undefined };
    }
    const v = validateRow(row, ctx);
    let state = row.state;
    if (state !== "deleted") state = !row.id ? "new" : isChanged(row, config.columns) ? "updated" : "clean";
    return { ...row, state, errors: v.errors, display: v.display, pending: v.pending, serverError: undefined };
  };

  /** Existing rows arrive with a lookup id only; fill the visible match value once resolved. */
  const fillHydrated = (row: GridRow): GridRow => {
    let next = row;
    config.columns.forEach(col => {
      const id = row.lookupIds[col.field];
      if (col.kind !== "lookup" || !id || row.values[col.field]) return;
      const hit = cache.getById(col.field, id);
      if (!hit) return;
      next = {
        ...next,
        values: { ...next.values, [col.field]: hit.matchValue },
        original: { ...next.original, [col.field]: hit.matchValue },
      };
    });
    return next;
  };

  return function reducer(state: GridState, action: GridAction): GridState {
    switch (action.type) {
      case "HYDRATE":
        return { ...INITIAL_STATE, rows: action.rows.map(finalize) };

      case "PASTE": {
        const rows = state.rows.slice();
        const limit = config.maxRows ?? 500;
        action.data.forEach((cells, i) => {
          const r = action.startRow + i;
          if (r >= limit) return;
          while (rows.length <= r) rows.push(blankRow());
          if (rows[r].state === "deleted") return;
          const values = { ...rows[r].values };
          cells.forEach((text, j) => {
            const col = config.columns[action.startCol + j];   // extra Excel columns are ignored
            if (col) values[col.field] = text.trim();
          });
          rows[r] = finalize({ ...rows[r], values });
        });
        return { ...state, rows, info: "", log: [] };
      }

      case "EDIT":
        return {
          ...state,
          rows: state.rows.map(r =>
            r.key !== action.key || r.values[action.field] === action.value
              ? r
              : finalize({ ...r, values: { ...r.values, [action.field]: action.value } })),
        };

      case "ADD_ROW":
        return { ...state, rows: [...state.rows, blankRow()] };

      case "TOGGLE_DELETE": {
        const target = state.rows.find(r => r.key === action.key);
        if (!target) return state;
        if (!target.id) return { ...state, rows: state.rows.filter(r => r.key !== action.key) };
        return {
          ...state,
          rows: state.rows.map(r => r.key !== action.key ? r
            : r.state === "deleted" ? finalize({ ...r, state: "clean" }) : { ...r, state: "deleted" }),
        };
      }

      case "LOOKUPS_RESOLVED":                   // only rows that were waiting are touched
        return { ...state, rows: state.rows.map(r => r.pending ? finalize(fillHydrated(r)) : r) };

      case "NOTICE":
        return { ...state, log: action.log };

      case "SAVE_START":
        return { ...state, saving: true, log: [], info: "" };

      case "SAVE_SUCCEEDED":
        return { ...INITIAL_STATE, info: "Saved. Reloading lines…" };

      case "SAVE_FAILED":
        return {
          ...state,
          saving: false,
          info: action.log.length > 0 ? `Save failed for ${Object.keys(action.rowErrors).length} row(s). Review the highlighted rows.` : "Save failed.",
          log: action.log,
          rows: state.rows.map(r => action.rowErrors[r.key] ? { ...r, serverError: action.rowErrors[r.key] } : r),
        };
    }
  };
}