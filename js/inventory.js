export function calculateRawUnitCost(price, quantity, normalizeNumber) {
  const normalizedPrice = normalizeNumber(price);
  const normalizedQuantity = normalizeNumber(quantity);

  if (normalizedPrice <= 0 || normalizedQuantity <= 0) {
    return 0;
  }

  return normalizedPrice / normalizedQuantity;
}

export function calculateUnitCost(item, context) {
  const packagePrice = context.normalizeNumber(item.packagePrice);
  const packageQuantity = context.normalizeNumber(item.packageQuantity);

  if (context.unitPurchaseCategories.includes(item.category) && item.purchaseMode === context.purchaseModeSingle) {
    return packagePrice;
  }

  if (context.supportedCategories.includes(item.category)) {
    return calculateRawUnitCost(packagePrice, packageQuantity, context.normalizeNumber);
  }

  return calculateRawUnitCost(packagePrice, packageQuantity, context.normalizeNumber);
}

export function calculateTotalInventoryValue(item, normalizeNumber) {
  return normalizeNumber(item.packagePrice) * normalizeNumber(item.stockQuantity);
}

export function calculateLineSubtotal(item, quantityUsed, context) {
  return calculateUnitCost(item, context) * context.normalizeNumber(quantityUsed);
}
