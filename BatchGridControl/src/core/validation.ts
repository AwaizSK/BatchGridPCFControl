import { CellMap, GridRow } from "./types";
import { KIND_HANDLERS, KindContext } from "./kinds";

export interface RowValidation { errors: CellMap; display: CellMap; pending: boolean; }

export function validateRow(row: GridRow, ctx: KindContext): RowValidation {
  const errors: CellMap = {};
  const display: CellMap = {};
  let pending = false;

  for (const col of ctx.config.columns) {
    const value = (row.values[col.field] ?? "").trim();

    if (!value) {
      // Existing line whose lookup id is still being resolved: not an error.
      const id = row.lookupIds[col.field];
      const untouched = (row.original?.[col.field] ?? "").trim() === "";
      if (col.kind === "lookup" && id && untouched) {
        if (ctx.cache.getById(col.field, id) === undefined) pending = true;
        continue;
      }
      if (col.required) errors[col.field] = `${col.label} is required`;
      continue;
    }

    const result = KIND_HANDLERS[col.kind].validate(value, col, ctx);
    if (result.error) errors[col.field] = result.error;
    if (result.pending) pending = true;
    if (result.display) display[col.field] = result.display;
  }
  return { errors, display, pending };
}