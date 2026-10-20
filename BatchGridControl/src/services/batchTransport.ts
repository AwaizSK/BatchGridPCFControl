import { BatchOperation } from "../core/operations";

export type BatchOutcome = "committed" | "rolled-back" | "unknown";
export interface BatchResult { outcome: BatchOutcome; log: string[]; rowErrors: Record<string, string>; }
export interface BatchTransport { execute(ops: BatchOperation[]): Promise<BatchResult>; }

const MAX_OPERATIONS = 1000;   // Dataverse limit per batch
const sleep = (ms: number): Promise<void> => new Promise(resolve => window.setTimeout(resolve, ms));

export function buildBatchBody(baseUrl: string, ops: BatchOperation[], batchId: string, changesetId: string): string {
  const L: string[] = [`--${batchId}`, `Content-Type: multipart/mixed;boundary=${changesetId}`, ""];
  ops.forEach(op => {
    L.push(`--${changesetId}`, "Content-Type: application/http", "Content-Transfer-Encoding: binary",
      `Content-ID: ${op.contentId}`, "", `${op.method} ${baseUrl}/${op.path} HTTP/1.1`);
    if (op.method === "PATCH") L.push("If-Match: *");           // never upsert
    if (op.body) L.push("Content-Type: application/json;type=entry", "", JSON.stringify(op.body));
    else L.push("");
    L.push("");
  });
  L.push(`--${changesetId}--`, `--${batchId}--`, "");
  return L.join("\r\n");
}

function errorMessage(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return "";
  try {
    const payload = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown> | null;
    const error = payload && typeof payload.error === "object" ? payload.error as Record<string, unknown> : undefined;
    const message = error?.message;
    return typeof message === "string" ? message : "";
  } catch { return ""; }
}

export function parseBatchResponse(httpStatus: number, text: string, ops: BatchOperation[]): BatchResult {
  const rowErrors: Record<string, string> = {};
  const log: string[] = [];
  let okCount = 0;

  text.split(/--(?:batch|changeset)response_[^\r\n]*/i).forEach(part => {
    const m = /HTTP\/1\.1\s+(\d{3})/.exec(part);
    if (!m) return;
    const status = Number(m[1]);
    if (status < 400) { okCount++; return; }
    const cid = /Content-ID:\s*(\d+)/i.exec(part);
    const op = cid ? ops.find(o => o.contentId === Number(cid[1])) : undefined;
    const msg = errorMessage(part) || `HTTP ${status}`;
    if (op) {
      rowErrors[op.rowKey] = `${op.label} (${op.method}): ${msg}`;
      log.push(`${op.label} (${op.method}): ${msg}`);
    } else {
      log.push(msg);
    }
  });

  if (httpStatus < 400 && log.length === 0 && okCount === ops.length) {
    return { outcome: "committed", log: [], rowErrors };
  }
  if (log.length === 0) log.push(errorMessage(text) || `The server rejected the batch (HTTP ${httpStatus}).`);
  log.push("The whole batch was rolled back. No lines were committed.");
  return { outcome: "rolled-back", log, rowErrors };
}

export class ODataBatchTransport implements BatchTransport {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(orgUrl: string, opts: { apiVersion?: string; timeoutMs?: number; maxRetries?: number } = {}) {
    this.baseUrl = `${orgUrl.replace(/\/$/, "")}/api/data/${opts.apiVersion ?? "v9.2"}`;
    this.timeoutMs = opts.timeoutMs ?? 120000;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  async execute(ops: BatchOperation[]): Promise<BatchResult> {
    if (ops.length > MAX_OPERATIONS) {
      return { outcome: "rolled-back", rowErrors: {}, log: [
        `${ops.length} operations exceed the ${MAX_OPERATIONS} limit of one atomic batch. Nothing was saved.`] };
    }
    const id = Math.random().toString(36).slice(2);
    const batchId = `batch_${id}`;
    const body = buildBatchBody(this.baseUrl, ops, batchId, `changeset_${id}`);

    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/$batch`, {
          method: "POST", signal: ctrl.signal, credentials: "same-origin", body,
          headers: {
            "Content-Type": `multipart/mixed;boundary=${batchId}`,
            Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0",
          },
        });
        // Throttled before execution → nothing ran, so a retry is safe.
        if ((res.status === 429 || res.status === 503) && attempt < this.maxRetries) {
          const retryAfter = Number(res.headers.get("Retry-After"));
          await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * Math.pow(2, attempt));
          continue;
        }
        return parseBatchResponse(res.status, await res.text(), ops);
      } catch (err) {
        // The request may or may not have reached the server before we lost contact.
        const reason = (err as Error)?.name === "AbortError" ? "The request timed out." : "A network error occurred.";
        return { outcome: "unknown", rowErrors: {}, log: [
          `${reason} The save status is unknown. The grid is reloading from the server; verify before saving again.`] };
      } finally {
        window.clearTimeout(timer);
      }
    }
  }
}