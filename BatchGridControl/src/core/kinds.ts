import { ColumnConfig, ColumnKind, GridConfig } from "./types";
import { LookupCache } from "./lookupcache";

export interface KindContext { config: GridConfig; cache: LookupCache; }
export interface KindResult { error?: string; pending?: boolean; display?: string; }
export interface KindHandler {
  validate(value: string, col: ColumnConfig, ctx: KindContext): KindResult;
  payload(value: string, col: ColumnConfig, ctx: KindContext): Record<string, unknown>;
  clearPayload(col: ColumnConfig): Record<string, unknown>;
}

/** Strips currency symbols/spaces and normalises the decimal separator to ".". */
export function normalizeNumber(raw: string, separator: "." | ","): string {
  const s = raw.trim().replace(/[\s\u00A0$€£₹¥]/g, "");
  return separator === "," ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
}

const bindOf = (col: ColumnConfig): string => col.bindName ?? col.field;

const textHandler: KindHandler = {
  validate: (value, col) =>
    col.maxLength !== undefined && value.length > col.maxLength
      ? { error: `${col.label} allows at most ${col.maxLength} characters` } : {},
  payload: (value, col) => ({ [col.field]: value }),
  clearPayload: col => ({ [col.field]: null }),
};

function numberHandler(integer: boolean): KindHandler {
  const pattern = integer ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/;
  return {
    validate(value, col, ctx) {
      const norm = normalizeNumber(value, ctx.config.decimalSeparator ?? ".");
      if (!pattern.test(norm)) return { error: `${col.label} must be ${integer ? "a whole" : "a valid"} number` };
      const n = Number(norm);
      const decimals = (norm.split(".")[1] ?? "").length;
      if (!integer && decimals > (col.precision ?? 2)) {
        return { error: `${col.label} allows at most ${col.precision ?? 2} decimal places` };
      }
      if (col.min !== undefined && n < col.min) return { error: `${col.label} must be at least ${col.min}` };
      if (col.max !== undefined && n > col.max) return { error: `${col.label} must be at most ${col.max}` };
      return {};
    },
    payload: (value, col, ctx) => ({ [col.field]: Number(normalizeNumber(value, ctx.config.decimalSeparator ?? ".")) }),
    clearPayload: col => ({ [col.field]: null }),
  };
}

const lookupHandler: KindHandler = {
  validate(value, col, ctx) {
    const hit = ctx.cache.getByValue(col.field, value);
    if (hit === undefined) return { pending: true };
    if (hit === null) return { error: `${col.label} "${value}" was not found or is inactive` };
    return { display: hit.display };
  },
  payload(value, col, ctx) {
    const lk = col.lookup!;
    const hit = ctx.cache.getByValue(col.field, value);
    if (!hit) throw new Error(`Lookup "${value}" is unresolved for ${col.field}`);
    const out: Record<string, unknown> = { [`${bindOf(col)}@odata.bind`]: `/${lk.targetEntitySet}(${hit.id})` };
    (lk.carry ?? []).forEach(c => {
      const id = hit.carry[c.bindName];
      if (id) out[`${c.bindName}@odata.bind`] = `/${c.targetEntitySet}(${id})`;
    });
    return out;
  },
  clearPayload: col => ({ [`${bindOf(col)}@odata.bind`]: null }),
};

export const KIND_HANDLERS: Record<ColumnKind, KindHandler> = {
  text: textHandler,
  integer: numberHandler(true),
  decimal: numberHandler(false),
  lookup: lookupHandler,
};