import { GridConfig, GridRow } from "./types";
import { KIND_HANDLERS, KindContext } from "./kinds";
import { isBlankRow } from "./store";

export interface BatchOperation {
  contentId: number;
  rowKey: string;
  label: string;               // "Row 7", shown in the error log
  method: "POST" | "PATCH" | "DELETE";
  path: string;                // relative to /api/data/vX.Y/
  body?: Record<string, unknown>;
}

export function buildOperations(config: GridConfig, parentId: string, rows: GridRow[], ctx: KindContext): BatchOperation[] {
  const ops: BatchOperation[] = [];
  let contentId = 1;

  rows.forEach((row, index) => {
    if (row.state === "clean" || isBlankRow(row)) return;
    const base = { contentId: contentId++, rowKey: row.key, label: `Row ${index + 1}` };

    if (row.state === "deleted") {
      ops.push({ ...base, method: "DELETE", path: `${config.entitySetName}(${row.id})` });
      return;
    }

    const isNew = row.state === "new";
    const body: Record<string, unknown> = {};
    if (isNew) {
      Object.assign(body, config.fixedValues ?? {});
      body[`${config.parent.bindName}@odata.bind`] = `/${config.parent.entitySetName}(${parentId})`;
      if (config.primaryIdField) body[config.primaryIdField] = row.key; // client-generated id → duplicate-safe retries
    }

    config.columns.forEach(col => {
      const value = (row.values[col.field] ?? "").trim();
      const original = (row.original?.[col.field] ?? "").trim();
      if (!isNew && value === original) return;                  // unchanged field
      const handler = KIND_HANDLERS[col.kind];
      if (!value) { if (!isNew) Object.assign(body, handler.clearPayload(col)); return; }
      Object.assign(body, handler.payload(value, col, ctx));
    });

    ops.push(isNew
      ? { ...base, method: "POST", path: config.entitySetName, body }
      : { ...base, method: "PATCH", path: `${config.entitySetName}(${row.id})`, body });
  });
  return ops;
}