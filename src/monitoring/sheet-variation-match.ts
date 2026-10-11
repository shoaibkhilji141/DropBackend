import { EbayItemVariation } from '../integrations/ebay/ebay-rest.client';
import { SupplierProductVariant } from '../integrations/aliexpress/aliexpress.types';
import { GoogleSheetVariationView } from './sheet-monitoring.types';

interface AspectPair {
  name: string;
  value: string;
}

export function matchEbayToSupplier(
  ebayVars: EbayItemVariation[],
  supplierVars: SupplierProductVariant[],
  shippingCost: number,
  previous: GoogleSheetVariationView[],
): GoogleSheetVariationView[] {
  if (supplierVars.length === 0) {
    return ebayVars.map((ebay, index) => {
      const prior = findPrevious(previous, ebay, index);
      return {
        key: variationKey(ebay, index),
        label: ebay.label,
        ebaySku: ebay.sku,
        aliSkuId: prior?.aliSkuId ?? null,
        matched: prior?.matched ?? false,
        ebayPrice: ebay.price > 0 ? ebay.price : prior?.ebayPrice ?? null,
        ebayQuantity: ebay.quantity,
        supplierPrice: prior?.supplierPrice ?? null,
        previousSupplierPrice: prior?.previousSupplierPrice ?? prior?.supplierPrice ?? null,
        supplierPriceChanged: prior?.supplierPriceChanged ?? false,
        supplierStock: prior?.supplierStock ?? null,
        previousSupplierStock: prior?.previousSupplierStock ?? prior?.supplierStock ?? null,
        supplierStockChanged: prior?.supplierStockChanged ?? false,
        taxAmount: null,
        netEbay: null,
        profit: null,
        profitPercent: null,
      };
    });
  }

  const used = new Set<string>();
  return ebayVars.map((ebay, index) => {
    const supplier = pickSupplierVariant(ebay, supplierVars, used);
    if (supplier) used.add(supplier.externalId);
    const landed =
      supplier && supplier.costPrice > 0 ? roundMoney(supplier.costPrice + shippingCost) : null;
    const prior = findPrevious(previous, ebay, index);
    const supplierStock = supplier ? supplier.stock : null;
    return {
      key: variationKey(ebay, index),
      label: ebay.label,
      ebaySku: ebay.sku,
      aliSkuId: supplier?.externalId ?? null,
      matched: Boolean(supplier),
      ebayPrice: ebay.price > 0 ? ebay.price : null,
      ebayQuantity: ebay.quantity,
      supplierPrice: landed,
      previousSupplierPrice: prior?.supplierPrice ?? null,
      supplierPriceChanged: changedMoney(landed, prior?.supplierPrice ?? null),
      supplierStock,
      previousSupplierStock: prior?.supplierStock ?? null,
      supplierStockChanged: changedStock(supplierStock, prior?.supplierStock ?? null),
      taxAmount: null,
      netEbay: null,
      profit: null,
      profitPercent: null,
    };
  });
}

export function parseVariationJson(raw: string | null | undefined): GoogleSheetVariationView[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVariationView);
  } catch {
    return [];
  }
}

function pickSupplierVariant(
  ebay: EbayItemVariation,
  supplierVars: SupplierProductVariant[],
  used: Set<string>,
): SupplierProductVariant | null {
  const available = supplierVars.filter((variant) => !used.has(variant.externalId));
  if (available.length === 0) return null;

  if (ebay.sku) {
    const exact = available.find((variant) => idsEqual(variant.externalId, ebay.sku));
    if (exact) return exact;
    const contained = available.find(
      (variant) =>
        ebay.sku!.includes(variant.externalId) || variant.externalId.includes(ebay.sku!),
    );
    if (contained) return contained;
  }

  const ebayValues = aspectValues(ebay.specifics);
  if (ebayValues.size === 0) return null;

  let best: SupplierProductVariant | null = null;
  let bestScore = 0;
  let ties = 0;
  for (const variant of available) {
    const score = valueOverlap(ebayValues, aspectValues(parseAspects(variant.attributes, variant.name)));
    if (score > bestScore) {
      best = variant;
      bestScore = score;
      ties = 1;
    } else if (score === bestScore && score > 0) {
      ties += 1;
    }
  }
  if (best && bestScore >= ebayValues.size && ties === 1) return best;
  if (best && bestScore > 0 && ties === 1 && bestScore >= Math.max(1, ebayValues.size - 1)) {
    return best;
  }
  return null;
}

function parseAspects(attributes: string | null | undefined, fallbackName: string): AspectPair[] {
  const pairs: AspectPair[] = [];
  if (attributes?.trim()) {
    for (const part of attributes.split(/[;|,]/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const hash = trimmed.match(/#(.+)$/);
      const colon = trimmed.indexOf(':');
      if (hash && colon > 0) {
        pairs.push({ name: trimmed.slice(0, colon).trim() || 'Option', value: hash[1].trim() });
      } else if (colon > 0) {
        pairs.push({
          name: trimmed.slice(0, colon).trim(),
          value: trimmed.slice(colon + 1).trim(),
        });
      }
    }
  }
  if (pairs.length === 0 && fallbackName) {
    pairs.push({ name: 'Variation', value: fallbackName });
  }
  return pairs.filter((pair) => pair.name && pair.value);
}

function aspectValues(pairs: AspectPair[]): Set<string> {
  return new Set(pairs.map((pair) => normalizeValue(pair.value)).filter(Boolean));
}

function valueOverlap(ebayValues: Set<string>, supplierValues: Set<string>): number {
  let score = 0;
  for (const value of ebayValues) {
    if (supplierValues.has(value)) {
      score += 1;
      continue;
    }
    for (const other of supplierValues) {
      if (value.includes(other) || other.includes(value)) {
        score += 0.75;
        break;
      }
    }
  }
  return score;
}

function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/colour/g, 'color')
    .replace(/[^a-z0-9]+/g, '');
}

function idsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return left.trim() === right.trim();
}

function variationKey(ebay: EbayItemVariation, index: number): string {
  if (ebay.sku) return `sku:${ebay.sku}`;
  const specifics = ebay.specifics.map((row) => `${row.name}=${row.value}`).join('|');
  if (specifics) return `spec:${specifics}`;
  return `idx:${index}`;
}

function findPrevious(
  previous: GoogleSheetVariationView[],
  ebay: EbayItemVariation,
  index: number,
): GoogleSheetVariationView | undefined {
  const key = variationKey(ebay, index);
  return (
    previous.find((row) => row.key === key) ??
    previous.find((row) => row.ebaySku && row.ebaySku === ebay.sku) ??
    previous.find((row) => row.label === ebay.label)
  );
}

function changedMoney(current: number | null, previous: number | null): boolean {
  return current !== null && previous !== null && previous > 0 && current !== previous;
}

function changedStock(current: number | null, previous: number | null): boolean {
  return current !== null && previous !== null && previous > 0 && current !== previous;
}

function isVariationView(value: unknown): value is GoogleSheetVariationView {
  if (!value || typeof value !== 'object') return false;
  const row = value as GoogleSheetVariationView;
  return typeof row.key === 'string' && typeof row.label === 'string';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
