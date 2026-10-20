export type ColumnKind = "text" | "integer" | "decimal" | "lookup";
export type RowState = "clean" | "new" | "updated" | "deleted";
export type CellMap = Record<string, string>;

export interface LookupCarry {
  sourceField: string;      // field on the looked-up record, e.g. _defaultuomid_value
  bindName: string;         // navigation property to set on the line, e.g. uomid
  targetEntitySet: string;  // e.g. uoms
}

export interface LookupConfig {
  targetEntity: string;     // logical name, used by webAPI.retrieveMultipleRecords
  targetEntitySet: string;  // entity set name, used in @odata.bind
  idField: string;          // primary key, e.g. productid
  matchField: string;       // what the user types/pastes, e.g. productnumber
  displayField?: string;    // shown read-only next to the cell, e.g. name
  filter?: string;          // applied to typed values only, e.g. statecode eq 0
  carry?: LookupCarry[];
}

export interface ColumnConfig {
  field: string;            // logical name of the column on the line table
  label: string;
  kind: ColumnKind;
  bindName?: string;        // lookups: navigation property (case-sensitive), defaults to field
  required?: boolean;
  precision?: number;       // decimal only
  min?: number;
  max?: number;
  maxLength?: number;       // text only
  lookup?: LookupConfig;
}

export interface GridConfig {
  entitySetName: string;                 // line table entity set, e.g. salesorderdetails
  primaryIdField?: string;               // enables client-generated ids (idempotent retries)
  parent: { bindName: string; entitySetName: string };
  columns: ColumnConfig[];               // order = order Excel columns map on paste
  fixedValues?: Record<string, unknown>; // applied to new rows only
  decimalSeparator?: "." | ",";
  maxRows?: number;
}

export interface LookupHit {
  id: string;
  matchValue: string;
  display: string;
  carry: Record<string, string>;         // bindName -> id
}

export interface GridRow {
  key: string;
  id?: string;                           // present for existing rows
  state: RowState;
  values: CellMap;                       // raw text as typed/pasted
  original?: CellMap;
  lookupIds: CellMap;                    // existing rows: lookup ids awaiting resolution
  errors: CellMap;
  display: CellMap;                      // read-only lookup display values
  pending: boolean;                      // lookup resolution in flight
  serverError?: string;
}