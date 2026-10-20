import * as React from "react";
import { GridConfig } from "../core/types";
import { LookupCache } from "../core/lookupcache";
import { createGridReducer, INITIAL_STATE, isBlankRow, selectDirty } from "../core/store";
import { parseTsv } from "../core/tsv";
import { buildOperations } from "../core/operations";
import { BatchTransport } from "../services/batchTransport";
import { mapDataset } from "../services/datasetMapper";
import { useLookupResolver } from "../hooks/useLookupResolver";
import { useGridNavigation } from "../hooks/useGridNavigation";
import { clampWindowStart, DEFAULT_WINDOW_SIZE, getVisibleRange } from "../core/windowing";
import { GridRowView } from "./GridRowView";

export interface GridServices {
  cache: LookupCache;
  transport: BatchTransport;
  refreshParentForm(): void;
}

export interface BatchGridProps {
  config: GridConfig;
  services: GridServices;
  webApi: ComponentFramework.WebApi;
  dataset: ComponentFramework.PropertyTypes.DataSet;
  dataVersion: string;
  parentId: string | undefined;
  readOnly: boolean;
}

export const BatchGrid: React.FC<BatchGridProps> = ({ config, services, webApi, dataset, dataVersion, parentId, readOnly }) => {
  const reducer = React.useMemo(() => createGridReducer({ config, cache: services.cache }), [config, services.cache]);
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);
  const [windowStart, setWindowStart] = React.useState(0);

  const gridRef = React.useRef<HTMLDivElement>(null);
  const rowsRef = React.useRef(state.rows);
  rowsRef.current = state.rows;
  const rowCountRef = React.useRef(0);
  rowCountRef.current = state.rows.length;

  const dirty = React.useMemo(() => selectDirty(state.rows), [state.rows]);
  const dirtyCountRef = React.useRef(0);
  dirtyCountRef.current = dirty.length;
  const blocked = React.useMemo(() => state.rows.some(r =>
    r.state !== "deleted" && !isBlankRow(r) && (r.pending || Object.keys(r.errors).length > 0)), [state.rows]);
  const visibleRange = React.useMemo(() => getVisibleRange(state.rows.length, windowStart, DEFAULT_WINDOW_SIZE), [state.rows.length, windowStart]);
  const visibleRows = React.useMemo(() => state.rows.slice(visibleRange.start, visibleRange.end), [state.rows, visibleRange.start, visibleRange.end]);
  const failedRowCount = Object.keys(state.rows.filter(r => r.serverError).reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.serverError ?? "";
    return acc;
  }, {})).length;

  React.useEffect(() => {
    setWindowStart(prev => clampWindowStart(state.rows.length, prev, DEFAULT_WINDOW_SIZE));
  }, [state.rows.length]);

  const addRow = React.useCallback(() => dispatch({ type: "ADD_ROW" }), []);
  const { onKeyDown, flushPendingFocus } = useGridNavigation(gridRef, config.columns.length, rowCountRef, addRow);
  React.useEffect(flushPendingFocus, [state.rows.length, flushPendingFocus]);

  // 1. Load from the subgrid, only when nothing is staged (never clobber unsaved work).
  React.useEffect(() => {
    if (!dataset.loading && dirtyCountRef.current === 0) {
      dispatch({ type: "HYDRATE", rows: mapDataset(dataset, config) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, dataset.loading]);

  // 2. Async lookup validation.
  useLookupResolver(state.rows, config, services.cache, webApi, dispatch);

  // 3. Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (dirty.length === 0) return undefined;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.length]);

  const onEdit = React.useCallback((key: string, field: string, value: string) =>
    dispatch({ type: "EDIT", key, field, value }), []);
  const onToggleDelete = React.useCallback((key: string) => dispatch({ type: "TOGGLE_DELETE", key }), []);

  const onPaste = React.useCallback((e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text.replace(/[\r\n]+$/, ""))) return;   // single value → native paste
    e.preventDefault();
    dispatch({ type: "PASTE", startRow: r, startCol: c, data: parseTsv(text) });
  }, []);

  const save = React.useCallback(async () => {
    if (!parentId) return;
    dispatch({ type: "SAVE_START" });
    try {
      const ops = buildOperations(config, parentId, rowsRef.current, { config, cache: services.cache });
      const result = await services.transport.execute(ops);
      if (result.outcome === "committed") {
        dispatch({ type: "SAVE_SUCCEEDED" });
        dataset.refresh();
        services.refreshParentForm();
      } else {
        dispatch({ type: "SAVE_FAILED", log: result.log, rowErrors: result.rowErrors });
        if (result.outcome === "unknown") dataset.refresh();
      }
    } catch (err) {
      dispatch({ type: "SAVE_FAILED", rowErrors: {}, log: [`Could not prepare the save: ${(err as Error).message}`] });
    }
  }, [config, dataset, parentId, services]);

  const discard = React.useCallback(
    () => dispatch({ type: "HYDRATE", rows: mapDataset(dataset, config) }), [dataset, config]);

  const disabledReason = !parentId ? "Save the record first to add lines." : readOnly ? "This record is read-only." : "";
  const showWindowing = state.rows.length > DEFAULT_WINDOW_SIZE;

  return (
    <div className="xg" ref={gridRef}>
      <div className="xg-bar">
        <button type="button" className="primary" disabled={readOnly || blocked || dirty.length === 0 || state.saving} onClick={() => void save()}>
          {state.saving ? "Saving…" : `Save Changes (${dirty.length})`}
        </button>
        <button type="button" disabled={readOnly || state.saving} onClick={addRow}>+ Add row</button>
        <button type="button" disabled={dirty.length === 0 || state.saving} onClick={discard}>Discard</button>
        {showWindowing && (
          <>
            <button type="button" disabled={windowStart === 0 || state.saving} onClick={() => setWindowStart(prev => clampWindowStart(state.rows.length, prev - DEFAULT_WINDOW_SIZE, DEFAULT_WINDOW_SIZE))}>Previous</button>
            <span className="xg-window-meta">Rows {visibleRange.start + 1}-{visibleRange.end} of {state.rows.length}</span>
            <button type="button" disabled={visibleRange.end >= state.rows.length || state.saving} onClick={() => setWindowStart(prev => clampWindowStart(state.rows.length, prev + DEFAULT_WINDOW_SIZE, DEFAULT_WINDOW_SIZE))}>Next</button>
          </>
        )}
        <span className="hint">{disabledReason || "Ctrl+V pastes Excel rows. Arrows, Tab and Enter move between cells."}</span>
      </div>
      {state.info && <div className="xg-info" role="status">{state.info}</div>}
      {failedRowCount > 0 && (
        <div className="xg-warning" role="status">{failedRowCount} row(s) need attention. Review the highlighted cells and retry the save.</div>
      )}
      {state.log.length > 0 && <ul className="xg-log" role="alert">{state.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {dataset.paging.hasNextPage && (
        <div className="xg-log" role="alert">More lines exist than the grid loads. Increase the page size before editing.</div>
      )}
      <table>
        <thead>
          <tr>
            <th />
            {config.columns.map(c => (
              <React.Fragment key={c.field}>
                <th>{c.label}{c.required ? " *" : ""}</th>
                {c.lookup?.displayField && <th />}
              </React.Fragment>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, r) => {
            const rowIndex = visibleRange.start + r;
            return (
              <GridRowView key={row.key} row={row} rowIndex={rowIndex} columns={config.columns}
                readOnly={readOnly || !parentId} onEdit={onEdit} onToggleDelete={onToggleDelete}
                onKeyDown={onKeyDown} onPaste={onPaste} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
};