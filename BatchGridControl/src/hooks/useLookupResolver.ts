import * as React from "react";
import { GridConfig, GridRow } from "../core/types";
import { LookupCache } from "../core/lookupcache";
import { GridAction } from "../core/store";
import { findUnresolved, resolveLookup } from "../services/lookupResolver";

/** Debounced, batched, off the typing path. Rows stay "pending" (and block Save) until it returns. */
export function useLookupResolver(
  rows: GridRow[], config: GridConfig, cache: LookupCache,
  webApi: ComponentFramework.WebApi, dispatch: React.Dispatch<GridAction>,
): void {
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const work = findUnresolved(rows, config, cache);
      if (work.length === 0) return;
      void Promise.all(work.map(w => resolveLookup(webApi, w, cache)))
        .then(() => {
          if (mounted.current) dispatch({ type: "LOOKUPS_RESOLVED" });
          return undefined;
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Unknown lookup validation error";
          if (mounted.current) {
            dispatch({ type: "NOTICE", log: [`Could not validate lookups: ${message}. Edit a cell to retry.`] });
          }
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [rows, config, cache, webApi, dispatch]);
}