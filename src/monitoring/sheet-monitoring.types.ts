export interface GoogleSheetSourceView {
  id: string;
  spreadsheetUrl: string;
  spreadsheetId: string;
  worksheetName: string;
  supplierColumn: number;
  ebayColumn: number;
  titleColumn: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastStatus: string | null;
  updatedAt: string;
}

export interface GoogleSheetRefreshProgress {
  running: boolean;
  done: number;
  total: number;
  lastError: string | null;
}

export interface GoogleSheetVariationView {
  key: string;
  label: string;
  ebaySku: string | null;
  aliSkuId: string | null;
  matched: boolean;
  ebayPrice: number | null;
  ebayQuantity: number | null;
  supplierPrice: number | null;
  previousSupplierPrice: number | null;
  supplierPriceChanged: boolean;
  supplierStock: number | null;
  previousSupplierStock: number | null;
  supplierStockChanged: boolean;
  taxAmount: number | null;
  netEbay: number | null;
  profit: number | null;
  profitPercent: number | null;
}

export interface GoogleSheetRowView {
  id: string | null;
  sheetRow: number;
  title: string | null;
  supplierUrl: string;
  ebayUrl: string;
  supplierId: string | null;
  ebayItemId: string | null;
  productId: string | null;
  listingId: string | null;
  status: string;
  lastError: string | null;
  supplierPrice: number | null;
  previousSupplierPrice: number | null;
  supplierPriceChanged: boolean;
  supplierStock: number | null;
  previousSupplierStock: number | null;
  supplierStockChanged: boolean;
  supplierShipping: number | null;
  supplierCurrency: string | null;
  ebayPrice: number | null;
  ebayQuantity: number | null;
  ebayCurrency: string | null;
  taxPercent: number;
  taxAmount: number | null;
  netEbay: number | null;
  profit: number | null;
  profitPercent: number | null;
  priceRuleEnabled: boolean;
  stockRuleEnabled: boolean;
  variations: GoogleSheetVariationView[];
}

export interface GoogleSheetState {
  source: GoogleSheetSourceView | null;
  rows: GoogleSheetRowView[];
  taxPercent: number;
  refresh: GoogleSheetRefreshProgress;
  defaults: {
    spreadsheetUrl: string;
    worksheetName: string;
    supplierColumn: number;
    ebayColumn: number;
    titleColumn: number;
  };
}

export interface GoogleSheetSyncResult {
  source: GoogleSheetSourceView;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: GoogleSheetRowView[];
}
