import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { BatchGrid, GridServices } from "./src/components/BatchGrid";
import { ConfigError, parseConfig } from "./src/core/config";
import { GridConfig } from "./src/core/types";
import { LookupCache } from "./src/core/lookupcache";
import { normalizeGuid } from "./src/core/guid";
import { ODataBatchTransport } from "./src/services/batchTransport";
import { buildDataVersion } from "./src/services/datasetMapper";
import { refreshParentForm } from "./src/services/platform";

const PAGE_SIZE = 500;

export class BatchGridControl implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private readonly cache = new LookupCache();
  private services?: GridServices;
  private configSource = "";
  private config?: GridConfig;
  private configError = "";

  public init(context: ComponentFramework.Context<IInputs>): void {
    context.mode.trackContainerResize(true);
    context.parameters.lines.paging.setPageSize(PAGE_SIZE);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.loadConfig(context.parameters.gridConfig.raw ?? "");
    if (!this.config) {
      return React.createElement("div", { className: "xg-log", role: "alert" }, this.configError);
    }
    const page = (context as unknown as { page?: { getClientUrl?: () => string; entityId?: string } }).page;
    this.services ??= {
      cache: this.cache,
      transport: new ODataBatchTransport(page?.getClientUrl?.() ?? ""),
      refreshParentForm,
    };
    const dataset = context.parameters.lines;
    return React.createElement(BatchGrid, {
      config: this.config,
      services: this.services,
      webApi: context.webAPI,
      dataset,
      dataVersion: buildDataVersion(dataset, this.config),
      parentId: page?.entityId ? normalizeGuid(page.entityId) : undefined,
      readOnly: context.mode.isControlDisabled,
    });
  }

  public getOutputs(): IOutputs { return {}; }
  public destroy(): void { this.cache.clear(); }

  /** Re-parse only when the JSON text actually changes, so `config` keeps a stable identity. */
  private loadConfig(raw: string): void {
    if (raw === this.configSource && (this.config ?? this.configError)) return;
    this.configSource = raw;
    try { this.config = parseConfig(raw); this.configError = ""; }
    catch (error) { this.config = undefined; this.configError = error instanceof ConfigError ? error.message : "Invalid gridConfig."; }
  }
}