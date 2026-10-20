import { describe, expect, it } from "vitest";
import { BatchOperation } from "./operations";
import { parseConfig } from "./config";
import { parseBatchResponse } from "../services/batchTransport";
import { clampWindowStart, getVisibleRange } from "./windowing";

const baseConfig = {
  entitySetName: "orderdetails",
  parent: { bindName: "parentid", entitySetName: "orders" },
  columns: [
    { field: "productname", label: "Product", kind: "text", maxLength: 50 },
    { field: "qty", label: "Qty", kind: "integer", min: 0 },
  ],
};

describe("config validation", () => {
  it("rejects unsupported decimal separators and invalid maxRows", () => {
    expect(() => parseConfig(JSON.stringify({ ...baseConfig, decimalSeparator: "/" }))).toThrow();
    expect(() => parseConfig(JSON.stringify({ ...baseConfig, maxRows: 0 }))).toThrow();
  });
});

describe("batch response parsing", () => {
  it("adds row context to the row error message for failed operations", () => {
    const ops: BatchOperation[] = [
      { contentId: 1, rowKey: "row-1", label: "Row 1", method: "PATCH", path: "orderdetails(1)" },
      { contentId: 2, rowKey: "row-2", label: "Row 2", method: "POST", path: "orderdetails" },
    ];

    const text = [
      "--batchresponse_1",
      "Content-Type: application/http",
      "Content-Transfer-Encoding: binary",
      "Content-ID: 1",
      "",
      "HTTP/1.1 200 OK",
      "",
      "--batchresponse_2",
      "Content-Type: application/http",
      "Content-Transfer-Encoding: binary",
      "Content-ID: 2",
      "",
      "HTTP/1.1 400 Bad Request",
      "Content-Type: application/json; odata.metadata=minimal",
      "",
      '{"error":{"message":"The quantity is invalid."}}',
      "",
      "--batchresponse_2--",
      "--batchresponse_1--",
    ].join("\r\n");

    const result = parseBatchResponse(400, text, ops);

    expect(result.outcome).toBe("rolled-back");
    expect(result.rowErrors["row-2"]).toContain("Row 2 (POST): The quantity is invalid.");
  });
});

describe("large-grid windowing", () => {
  it("keeps the visible window inside the valid row range", () => {
    expect(clampWindowStart(1200, 150, 100)).toBe(150);
    expect(clampWindowStart(1200, 1500, 100)).toBe(1100);
    expect(clampWindowStart(60, 500, 100)).toBe(0);
    expect(getVisibleRange(1200, 1100, 100)).toEqual({ start: 1100, end: 1200, page: 12, totalPages: 12 });
  });
});
