import { CellMap, GridConfig, GridRow } from "../core/types";
import { normalizeGuid } from "../core/guid";

interface DataSetRecord {
  getValue(fieldName: string): unknown;
  getFormattedValue(fieldName: string): string;
}

interface DataSet {
  sortedRecordIds: string[];
  records: Record<string, DataSetRecord>;
}

export function mapDataset(ds: DataSet, config: GridConfig): GridRow[] {
  return ds.sortedRecordIds.map(recordId => {
    const rec = ds.records[recordId];
    const values: CellMap = {};
    const lookupIds: CellMap = {};
    config.columns.forEach(col => {
      const raw = rec.getValue(col.field);
      if (col.kind === "lookup") {
        values[col.field] = "";
        const ref = raw as { id?: { guid?: string } } | null;
        if (ref && typeof ref === "object" && "id" in ref && ref.id && typeof ref.id === "object" && "guid" in ref.id && typeof ref.id.guid === "string") {
          lookupIds[col.field] = normalizeGuid(ref.id.guid);
        }
      } else {
        values[col.field] = raw == null ? "" : typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : "";
      }
    });
    const id = normalizeGuid(recordId);
    return { key: id, id, state: "clean", values, original: { ...values }, lookupIds, errors: {}, display: {}, pending: false };
  });
}

/** Cheap content fingerprint, computed once per platform update (not per keystroke). */
export function buildDataVersion(ds: DataSet, config: GridConfig): string {
  return ds.sortedRecordIds
    .map(id => `${id}|${config.columns.map(c => ds.records[id].getFormattedValue(c.field)).join("|")}`)
    .join(";");
}