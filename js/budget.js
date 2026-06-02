export function calculateBudgetTotals(budget, context) {
  const materialCost = budget.items.reduce((total, cartItem) => {
    const inventoryItem = context.findInventoryItem(cartItem.inventoryItemId);
    return inventoryItem ? total + context.calculateLineSubtotal(inventoryItem, cartItem.quantityUsed) : total;
  }, 0);
  const laborMultiplier = context.normalizeNumber(budget.sessionDuration) > 0
    ? context.normalizeNumber(budget.sessionDuration)
    : 1;
  const laborCost = context.normalizeNumber(budget.hourlyRate) * laborMultiplier;
  const totalCost = materialCost + laborCost;
  const marginType = budget.profitMarginType === "fixed" ? "fixed" : "percent";
  const marginValue = context.normalizeNumber(budget.profitMarginValue ?? budget.profitMarginPercent);
  const marginCost = marginType === "fixed"
    ? marginValue
    : totalCost * (context.normalizePercent(marginValue) / 100);
  const suggestedPrice = totalCost + marginCost;
  const discountType = budget.discountType === "fixed" ? "fixed" : "percent";
  const discountValue = context.normalizeNumber(budget.discountValue ?? budget.discountPercent);
  const discountAmount = discountType === "fixed"
    ? Math.min(discountValue, suggestedPrice)
    : suggestedPrice * (context.normalizePercent(discountValue) / 100);
  const finalPrice = Math.max(suggestedPrice - discountAmount, 0);

  return {
    materialCost: context.roundMoneyValue(materialCost),
    laborCost: context.roundMoneyValue(laborCost),
    totalCost: context.roundMoneyValue(totalCost),
    marginCost: context.roundMoneyValue(marginCost),
    suggestedPrice: context.roundMoneyValue(suggestedPrice),
    discountAmount: context.roundMoneyValue(discountAmount),
    finalPrice: context.roundMoneyValue(finalPrice)
  };
}
