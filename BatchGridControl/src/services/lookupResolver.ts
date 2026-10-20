import { ColumnConfig, GridConfig, GridRow, LookupHit } from "../core/types";
import { LookupCache } from "../core/lookupcache";
import { GUID_RE } from "../core/guid";

const odataString = (v: string): string =>
  `'${v.replace(/'/g, "''").replace(/[%&#+]/g, ch => encodeURIComponent(ch))}'`;

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));
const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export interface UnresolvedWork { col: ColumnConfig; values: string[]; ids: string[]; }

export function findUnresolved(rows: GridRow[], config: GridConfig, cache: LookupCache): UnresolvedWork[] {
  const work: UnresolvedWork[] = [];
  config.columns.filter(c => c.kind === "lookup").forEach(col => {
    const values: string[] = [];
    const ids: string[] = [];
    rows.forEach(r => {
      if (r.state === "deleted") return;
      const v = (r.values[col.field] || "").trim();
      if (v && cache.getByValue(col.field, v) === undefined) values.push(v);
      const id = r.lookupIds[col.field];
      if (!v && id && cache.getById(col.field, id) === undefined) ids.push(id);
    });
    if (values.length || ids.length) {
      work.push({ col, values: unique(values.map(v => v.toUpperCase())), ids: unique(ids) });
    }
  });
  return work;
}

export async function resolveLookup(
  webApi: ComponentFramework.WebApi, { col, values, ids }: UnresolvedWork, cache: LookupCache,
): Promise<void> {
  const lk = col.lookup!;
  const select = unique([lk.idField, lk.matchField, lk.displayField, ...(lk.carry ?? []).map(c => c.sourceField)]
    .filter((x): x is string => !!x)).join(",");

  const toString = (value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  };

  const toHit = (e: Record<string, unknown>): LookupHit => {
    const carry: Record<string, string> = {};
    (lk.carry ?? []).forEach(c => {
      const raw = e[c.sourceField];
      if (raw !== undefined && raw !== null) carry[c.bindName] = toString(raw);
    });
    return {
      id: toString(e[lk.idField]),
      matchValue: toString(e[lk.matchField]),
      display: lk.displayField ? toString(e[lk.displayField]) : "",
      carry,
    };
  };

  const run = async (filter: string): Promise<void> => {
    const res = await webApi.retrieveMultipleRecords(lk.targetEntity, `?$select=${select}&$filter=${filter}`);
    res.entities.forEach(e => cache.put(col.field, toHit(e)));
  };

  const valueFilters = chunk(values, 25).map(c => {
    const match = c.map(v => `${lk.matchField} eq ${odataString(v)}`).join(" or ");
    return lk.filter ? `(${match}) and ${lk.filter}` : match;
  });
  const safeIds = ids.filter(id => GUID_RE.test(id));    // existing lines: no state filter, inactive items still display
  const idFilters = chunk(safeIds, 25).map(c => c.map(id => `${lk.idField} eq ${id}`).join(" or "));

  await Promise.all(valueFilters.concat(idFilters).map(run));

  values.forEach(v => { if (cache.getByValue(col.field, v) === undefined) cache.markValueMissing(col.field, v); });
  ids.forEach(id => { if (cache.getById(col.field, id) === undefined) cache.markIdMissing(col.field, id); });
}