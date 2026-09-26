import { SupplierProduct, SupplierShippingOption } from './aliexpress.types';

/**
 * Local-only market overlay. Monitoring reads live supplier data through
 * `getByExternalId`; this function makes that snapshot move over time so
 * background jobs can detect changes without calling any external API.
 */
export const applyDevelopmentDrift = (product: SupplierProduct): SupplierProduct => {
  const bucket = Math.floor(Date.now() / (2 * 60 * 1000));
  const seed = hash(`${product.externalId}:${bucket}`);
  const priceFactor = 1 + ((seed % 17) - 8) / 100;
  const stockShift = (seed % 9) - 4;
  const shippingFactor = 1 + ((seed % 11) - 5) / 20;
  const outOfStock = seed % 19 === 0;
  const shippingUnavailable = seed % 23 === 0;

  const costPrice = round(Math.max(0.5, product.costPrice * priceFactor));
  const stock = outOfStock ? 0 : Math.max(0, product.stock + stockShift * 8);
  const shippingOptions = shippingUnavailable
    ? []
    : product.shippingOptions.map((option) => scaleShipping(option, shippingFactor));
  const shippingCost = shippingOptions[0]?.cost ?? product.shippingCost;

  return {
    ...product,
    costPrice,
    stock,
    shippingCost,
    shippingOptions,
    variants: product.variants.map((variant) => ({
      ...variant,
      costPrice: round(Math.max(0.5, variant.costPrice * priceFactor)),
      stock: outOfStock ? 0 : Math.max(0, variant.stock + stockShift * 3),
    })),
  };
};

const scaleShipping = (
  option: SupplierShippingOption,
  factor: number,
): SupplierShippingOption => ({
  ...option,
  cost: round(Math.max(0, option.cost * factor)),
});

const hash = (value: string): number => {
  let next = 0;
  for (let index = 0; index < value.length; index += 1) {
    next = (next * 31 + value.charCodeAt(index)) >>> 0;
  }
  return next;
};

const round = (value: number): number => Math.round(value * 100) / 100;
