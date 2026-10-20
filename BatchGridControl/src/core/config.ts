import { ColumnConfig, GridConfig } from "./types";

export class ConfigError extends Error {}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KINDS = ["text", "integer", "decimal", "lookup"];

function ident(value: unknown, path: string): void {
  if (typeof value !== "string" || !IDENT.test(value)) {
    throw new ConfigError(`gridConfig: "${path}" must be a valid identifier.`);
  }
}

export function parseConfig(json: string): GridConfig {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new ConfigError("gridConfig is not valid JSON."); }
  const cfg = parsed as GridConfig;
  if (!cfg || typeof cfg !== "object") throw new ConfigError("gridConfig must be a JSON object.");

  ident(cfg.entitySetName, "entitySetName");
  ident(cfg.parent?.bindName, "parent.bindName");
  ident(cfg.parent?.entitySetName, "parent.entitySetName");
  if (cfg.primaryIdField !== undefined) ident(cfg.primaryIdField, "primaryIdField");
  if (cfg.decimalSeparator !== undefined && cfg.decimalSeparator !== "." && cfg.decimalSeparator !== ",") {
    throw new ConfigError('gridConfig: "decimalSeparator" must be "." or ",".');
  }
  if (cfg.maxRows !== undefined && (!Number.isInteger(cfg.maxRows) || cfg.maxRows <= 0)) {
    throw new ConfigError('gridConfig: "maxRows" must be a positive integer.');
  }
  if (!Array.isArray(cfg.columns) || cfg.columns.length === 0) {
    throw new ConfigError("gridConfig: at least one column is required.");
  }

  const seen: Record<string, boolean> = {};
  cfg.columns.forEach((col: ColumnConfig, i: number) => {
    const p = `columns[${i}]`;
    ident(col.field, `${p}.field`);
    if (seen[col.field]) throw new ConfigError(`gridConfig: duplicate column "${col.field}".`);
    seen[col.field] = true;
    if (typeof col.label !== "string") throw new ConfigError(`gridConfig: "${p}.label" is required.`);
    if (!KINDS.includes(col.kind)) throw new ConfigError(`gridConfig: "${p}.kind" must be one of ${KINDS.join(", ")}.`);
    if (col.bindName !== undefined) ident(col.bindName, `${p}.bindName`);
    if (col.kind === "lookup") {
      const lk = col.lookup;
      if (!lk) throw new ConfigError(`gridConfig: "${p}.lookup" is required for lookup columns.`);
      ["targetEntity", "targetEntitySet", "idField", "matchField"].forEach(k =>
        ident((lk as unknown as Record<string, unknown>)[k], `${p}.lookup.${k}`));
      (lk.carry ?? []).forEach((c, j) => {
        ident(c.sourceField, `${p}.lookup.carry[${j}].sourceField`);
        ident(c.bindName, `${p}.lookup.carry[${j}].bindName`);
        ident(c.targetEntitySet, `${p}.lookup.carry[${j}].targetEntitySet`);
      });
    }
  });
  return cfg;
}