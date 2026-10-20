import * as React from "react";
import { ColumnConfig, GridRow, RowState } from "../core/types";

const GLYPH: Record<RowState, string> = { clean: "", new: "●", updated: "✎", deleted: "✕" };

interface Props {
  row: GridRow;
  rowIndex: number;
  columns: ColumnConfig[];
  readOnly: boolean;
  onEdit(key: string, field: string, value: string): void;
  onToggleDelete(key: string): void;
  onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number): void;
  onPaste(e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number): void;
}

export const GridRowView = React.memo(function GridRowView(p: Props) {
  const { row, rowIndex: r } = p;
  return (
    <tr className={`row-${row.state}`} title={row.serverError}>
      <td className="ind" title={row.pending ? "Validating…" : row.state}>{row.pending ? "…" : GLYPH[row.state]}</td>
      {p.columns.map((col, c) => {
        const error = row.errors[col.field];
        return (
          <React.Fragment key={col.field}>
            <td className={row.serverError ? "srv-error" : undefined}>
              <input
                className={error ? "cell cell-error" : "cell"}
                data-r={r} data-c={c}
                value={row.values[col.field]}
                disabled={p.readOnly || row.state === "deleted"}
                title={error}
                aria-label={col.label}
                aria-invalid={!!error}
                onChange={e => p.onEdit(row.key, col.field, e.target.value)}
                onKeyDown={e => p.onKeyDown(e, r, c)}
                onPaste={e => p.onPaste(e, r, c)}
              />
            </td>
            {col.lookup?.displayField && <td className="ro">{row.display[col.field] || ""}</td>}
          </React.Fragment>
        );
      })}
      <td>
        <button type="button" disabled={p.readOnly} onClick={() => p.onToggleDelete(row.key)}>
          {row.state === "deleted" ? "Undo" : "Delete"}
        </button>
      </td>
    </tr>
  );
});