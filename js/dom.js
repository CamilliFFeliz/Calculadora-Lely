import { calculateBudgetTotals as calculateBudgetTotalsCore } from "./budget.js";
import { calculateLineSubtotal as calculateLineSubtotalCore, calculateRawUnitCost as calculateRawUnitCostCore, calculateTotalInventoryValue as calculateTotalInventoryValueCore, calculateUnitCost as calculateUnitCostCore } from "./inventory.js";
import { exportClientBudgetPdf, exportInternalBudgetPdf } from "./pdf.js";
import { createReactiveState, loadAppState as loadPersistedAppState, scheduleSaveAppState } from "./state.js";

const STORAGE_KEY = "CALCULADORA_SUBLIMACAO_STATE_V1";
const LEGACY_STORAGE_KEYS = [];
const THEME_COLOR = "#FBF8FF";
const CATEGORY_ALL = "Todos";
const CATEGORY_PRINT_SUPPLIES = "Insumos de Impressão";
const CATEGORY_BLANK_PRODUCTS = "Itens para Confecção/Lisos";
const CATEGORY_FINISHING_PACKAGING = "Acabamento e Embalagem";
const CATEGORY_ORDER = [CATEGORY_ALL, CATEGORY_PRINT_SUPPLIES, CATEGORY_BLANK_PRODUCTS, CATEGORY_FINISHING_PACKAGING];
const UNIT_PURCHASE_CATEGORIES = [CATEGORY_BLANK_PRODUCTS];
const CALCULATION_UNIT_BOX = "unitBox";
const CALCULATION_FRACTIONAL = "fractional";
const PURCHASE_MODE_BOX = "box";
const PURCHASE_MODE_SINGLE = "single";
const ADJUSTMENT_PERCENT = "percent";
const ADJUSTMENT_FIXED = "fixed";
const MEASURE_UNIT = "un";
const MEASURE_ML = "ml";
const MEASURE_METER = "m";
const MEASURE_SHEET = "folha";
const INTEGER_STEP = 1;
const DECIMAL_STEP = 0.5;
const MAX_IMAGE_SIZE_BYTES = 8000000;
const LOW_STOCK_THRESHOLD = 2;
const CLIENT_PDF_MAX_ITEMS = 1;
const BUDGET_INPUT_DEBOUNCE_MS = 220;
const CART_FAB_PULSE_MS = 700;
const BACKUP_APP_NAME = "Lely Sublimação";
const BACKUP_SCHEMA = "lely-sublimacao-inventory-backup";
const BACKUP_VERSION = 1;
const BACKUP_FILE_PREFIX = "backup_estoque_sublimacao";
const REFERENCE_STOCK_CREATED_AT = "2026-06-01T00:00:00.000Z";
const SCREEN_META = {
  home: { title: "Início", eyebrow: "Visão geral" },
  reports: { title: "Relatórios", eyebrow: "Indicadores" },
  inventory: { title: "Estoque", eyebrow: "Banco local" },
  budget: { title: "Orçamento", eyebrow: "Ficha do cliente" }
};
const SCREEN_HASHES = {
  home: "inicio",
  reports: "relatorios",
  inventory: "estoque",
  budget: "orcamento"
};
const HASH_SCREEN_MAP = {
  home: "home",
  inicio: "home",
  reports: "reports",
  relatorios: "reports",
  inventory: "inventory",
  estoque: "inventory",
  budget: "budget",
  orcamento: "budget"
};
const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});
const NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const CATEGORY_ICON_MAP = {
  [CATEGORY_ALL]: "layout-grid",
  [CATEGORY_PRINT_SUPPLIES]: "paintbrush",
  [CATEGORY_BLANK_PRODUCTS]: "shopping-bag",
  [CATEGORY_FINISHING_PACKAGING]: "gift"
};
const CATEGORY_DEFINITIONS = {
  [CATEGORY_PRINT_SUPPLIES]: {
    label: CATEGORY_PRINT_SUPPLIES,
    helper: "Tintas CMYK, papéis e filmes medidos por ml, folha ou metro.",
    calculationType: CALCULATION_FRACTIONAL,
    defaultMeasure: MEASURE_ML,
    fields: [
      { key: "name", label: "Nome do insumo", type: "text", placeholder: "Ex: Tinta Ciano, Filme DTF, Papel Sublimático", required: true },
      { key: "brand", label: "Marca ou fornecedor", type: "text", placeholder: "Opcional", required: false },
      { key: "color", label: "Cor / tipo", type: "text", placeholder: "Ex: Ciano, A4, filme", required: false },
      { key: "packageQuantity", label: "Quantidade da embalagem", type: "measure", inputMode: "decimal", placeholder: "1", required: true, options: [MEASURE_ML, MEASURE_SHEET, MEASURE_METER, MEASURE_UNIT] },
      { key: "packagePrice", label: "Custo da embalagem", type: "currency", inputMode: "decimal", placeholder: "0,00", required: false },
      { key: "stockQuantity", label: "Quantidade em estoque", type: "number", inputMode: "decimal", placeholder: "0", required: false }
    ]
  },
  [CATEGORY_BLANK_PRODUCTS]: {
    label: CATEGORY_BLANK_PRODUCTS,
    helper: "Canecas, camisetas, calças, ecobags, cuecas e bolsas por unidade.",
    calculationType: CALCULATION_UNIT_BOX,
    defaultMeasure: MEASURE_UNIT,
    fields: [
      { key: "name", label: "Nome da peça lisa", type: "text", placeholder: "Ex: Caneca branca, Camiseta lisa", required: true },
      { key: "brand", label: "Marca / modelo", type: "text", placeholder: "Opcional", required: false },
      { key: "purchaseMode", label: "Formato de compra", type: "select", required: true, options: [
        { value: PURCHASE_MODE_SINGLE, label: "Por unidade" },
        { value: PURCHASE_MODE_BOX, label: "Pacote / caixa" }
      ] },
      { key: "packageQuantity", label: "Quantidade no pacote", type: "number", inputMode: "numeric", placeholder: "12", required: true, visibleWhen: { key: "purchaseMode", value: PURCHASE_MODE_BOX } },
      { key: "packagePrice", label: "Custo do pacote", type: "currency", inputMode: "decimal", placeholder: "0,00", required: false, visibleWhen: { key: "purchaseMode", value: PURCHASE_MODE_BOX } },
      { key: "singleUnitPrice", label: "Custo unitário", type: "currency", inputMode: "decimal", placeholder: "0,00", required: false, visibleWhen: { key: "purchaseMode", value: PURCHASE_MODE_SINGLE } },
      { key: "stockQuantity", label: "Quantidade em estoque", type: "number", inputMode: "numeric", placeholder: "0", required: false }
    ]
  },
  [CATEGORY_FINISHING_PACKAGING]: {
    label: CATEGORY_FINISHING_PACKAGING,
    helper: "Fitas, folhas, papéis, embalagens e laços para finalizar pedidos.",
    calculationType: CALCULATION_FRACTIONAL,
    defaultMeasure: MEASURE_UNIT,
    fields: [
      { key: "name", label: "Nome do acabamento", type: "text", placeholder: "Ex: Fita de cetim, Embalagem padrão", required: true },
      { key: "brand", label: "Fornecedor / modelo", type: "text", placeholder: "Opcional", required: false },
      { key: "color", label: "Cor / tipo", type: "text", placeholder: "Ex: Lilás, coração, presente", required: false },
      { key: "packageQuantity", label: "Quantidade da embalagem", type: "measure", inputMode: "decimal", placeholder: "1", required: true, options: [MEASURE_UNIT, MEASURE_SHEET, MEASURE_METER] },
      { key: "packagePrice", label: "Custo da embalagem", type: "currency", inputMode: "decimal", placeholder: "0,00", required: false },
      { key: "stockQuantity", label: "Quantidade em estoque", type: "number", inputMode: "decimal", placeholder: "0", required: false }
    ]
  }
};
const DEFAULT_REFERENCE_STOCK = [
  createReferenceItem("print-ink-cyan", CATEGORY_PRINT_SUPPLIES, "Tinta da máquina - Ciano (C)", "Ciano / CMYK", MEASURE_ML),
  createReferenceItem("print-ink-magenta", CATEGORY_PRINT_SUPPLIES, "Tinta da máquina - Magenta (M)", "Magenta / CMYK", MEASURE_ML),
  createReferenceItem("print-ink-yellow", CATEGORY_PRINT_SUPPLIES, "Tinta da máquina - Amarela (Y)", "Amarela / CMYK", MEASURE_ML),
  createReferenceItem("print-ink-black", CATEGORY_PRINT_SUPPLIES, "Tinta da máquina - Preta (K)", "Preta / CMYK", MEASURE_ML),
  createReferenceItem("print-paper-sulfite", CATEGORY_PRINT_SUPPLIES, "Papel Sulfite A4", "Folha", MEASURE_SHEET),
  createReferenceItem("print-film-dtf", CATEGORY_PRINT_SUPPLIES, "Filme DTF", "Filme para transferência", MEASURE_METER),
  createReferenceItem("print-paper-sublimatic", CATEGORY_PRINT_SUPPLIES, "Papel Sublimático", "Folha / rolo", MEASURE_SHEET),
  createReferenceItem("blank-mug", CATEGORY_BLANK_PRODUCTS, "Caneca branca", "", MEASURE_UNIT),
  createReferenceItem("blank-shirt", CATEGORY_BLANK_PRODUCTS, "Camiseta lisa", "", MEASURE_UNIT),
  createReferenceItem("blank-pants", CATEGORY_BLANK_PRODUCTS, "Calça lisa", "", MEASURE_UNIT),
  createReferenceItem("blank-ecobag", CATEGORY_BLANK_PRODUCTS, "Sacola de pano (Ecobag)", "", MEASURE_UNIT),
  createReferenceItem("blank-underwear", CATEGORY_BLANK_PRODUCTS, "Cueca lisa", "", MEASURE_UNIT),
  createReferenceItem("blank-bag", CATEGORY_BLANK_PRODUCTS, "Bolsa lisa", "", MEASURE_UNIT),
  createReferenceItem("finish-satin-ribbon", CATEGORY_FINISHING_PACKAGING, "Fita de cetim", "", MEASURE_METER),
  createReferenceItem("finish-satin-sheet", CATEGORY_FINISHING_PACKAGING, "Folha de cetim", "", MEASURE_SHEET),
  createReferenceItem("finish-gift-paper", CATEGORY_FINISHING_PACKAGING, "Papel de presente", "", MEASURE_SHEET),
  createReferenceItem("finish-standard-package", CATEGORY_FINISHING_PACKAGING, "Embalagem padrão", "", MEASURE_UNIT),
  createReferenceItem("finish-heart-package", CATEGORY_FINISHING_PACKAGING, "Embalagem coração", "", MEASURE_UNIT),
  createReferenceItem("finish-bow", CATEGORY_FINISHING_PACKAGING, "Laço", "", MEASURE_UNIT)
];
const DEFAULT_BUDGET = {
  id: "budget-default",
  name: "Novo orçamento",
  clientName: "",
  hourlyRate: 0,
  sessionDuration: 0,
  profitMarginValue: 0,
  profitMarginType: ADJUSTMENT_PERCENT,
  profitMarginPercent: 0,
  discountValue: 0,
  discountType: ADJUSTMENT_PERCENT,
  discountPercent: 0,
  referenceImage: "",
  referenceImageName: "",
  items: []
};

const dom = {};
let appState = null;
let activeScreen = getInitialScreen();
let activeInventoryCategory = CATEGORY_ALL;
let activeBudgetCategory = CATEGORY_ALL;
let inventorySearchTerm = "";
let budgetSearchTerm = "";
let selectedFormCategory = CATEGORY_PRINT_SUPPLIES;
let editingItemId = null;
let backupStatusTimeoutId = 0;
let appToastTimeoutId = 0;
let addFeedbackTimeoutId = 0;
let budgetInputDebounceTimeoutId = 0;
let cartFabPulseTimeoutId = 0;
let recentlyAddedCartItemId = "";
let recentlyAddedInventoryItemId = "";
let isReactiveRenderingEnabled = false;
let reactiveRenderFrameId = 0;

export async function initializeApp() {
  bindDomReferences();
  appState = createReactiveState(await loadPersistedAppState({
    storageKey: STORAGE_KEY,
    legacyStorageKeys: LEGACY_STORAGE_KEYS,
    createInitialState,
    normalizeAppState
  }), handleReactiveStateChange);
  applyThemeColor();
  bindEvents();
  renderApp();
  isReactiveRenderingEnabled = true;
}

function createReferenceItem(id, category, name, color, measureUnit) {
  const isBlankProduct = category === CATEGORY_BLANK_PRODUCTS;

  return {
    id: `reference-${id}`,
    category,
    name,
    brand: "",
    color,
    purchaseMode: isBlankProduct ? PURCHASE_MODE_SINGLE : "",
    packageQuantity: 1,
    packagePrice: 0,
    stockQuantity: 0,
    measureUnit,
    calculationType: isBlankProduct ? CALCULATION_UNIT_BOX : CALCULATION_FRACTIONAL,
    createdAt: REFERENCE_STOCK_CREATED_AT,
    updatedAt: REFERENCE_STOCK_CREATED_AT
  };
}

function bindDomReferences() {
  dom.sidebar = document.querySelector("#sidebar");
  dom.drawerBackdrop = document.querySelector("#drawerBackdrop");
  dom.openSidebarButton = document.querySelector("#openSidebarButton");
  dom.navLinks = document.querySelectorAll("[data-screen-target]");
  dom.homeActions = document.querySelectorAll("[data-home-action]");
  dom.pageTitle = document.querySelector("#pageTitle");
  dom.pageEyebrow = document.querySelector("#pageEyebrow");
  dom.themeColorMeta = document.querySelector("#themeColorMeta");
  dom.screens = document.querySelectorAll("[data-screen]");
  dom.quickNewItemButton = document.querySelector("#quickNewItemButton");
  dom.openItemModalButton = document.querySelector("#openItemModalButton");
  dom.itemModal = document.querySelector("#itemModal");
  dom.itemForm = document.querySelector("#itemForm");
  dom.itemModalEyebrow = document.querySelector("#itemModalEyebrow");
  dom.itemModalTitle = document.querySelector("#itemModalTitle");
  dom.closeItemModalButton = document.querySelector("#closeItemModalButton");
  dom.resetItemFormButton = document.querySelector("#resetItemFormButton");
  dom.categoryChoiceGrid = document.querySelector("#categoryChoiceGrid");
  dom.dynamicFormTitle = document.querySelector("#dynamicFormTitle");
  dom.dynamicFieldsGrid = document.querySelector("#dynamicFieldsGrid");
  dom.unitCostPreview = document.querySelector("#unitCostPreview");
  dom.inventoryCounter = document.querySelector("#inventoryCounter");
  dom.inventorySearchInput = document.querySelector("#inventorySearchInput");
  dom.clearInventorySearchButton = document.querySelector("#clearInventorySearchButton");
  dom.inventoryCategoryFilters = document.querySelector("#inventoryCategoryFilters");
  dom.inventoryGrid = document.querySelector("#inventoryGrid");
  dom.budgetCounter = document.querySelector("#budgetCounter");
  dom.budgetNameInput = document.querySelector("#budgetNameInput");
  dom.clientNameInput = document.querySelector("#clientNameInput");
  dom.hourlyRateInput = document.querySelector("#hourlyRateInput");
  dom.sessionDurationInput = document.querySelector("#sessionDurationInput");
  dom.profitMarginInput = document.querySelector("#profitMarginInput");
  dom.profitMarginTypeSelect = document.querySelector("#profitMarginTypeSelect");
  dom.discountPercentInput = document.querySelector("#discountPercentInput");
  dom.discountTypeSelect = document.querySelector("#discountTypeSelect");
  dom.referenceImageInput = document.querySelector("#referenceImageInput");
  dom.removeReferenceImageButton = document.querySelector("#removeReferenceImageButton");
  dom.referencePreview = document.querySelector("#referencePreview");
  dom.materialTotalValue = document.querySelector("#materialTotalValue");
  dom.laborTotalValue = document.querySelector("#laborTotalValue");
  dom.budgetTotalValue = document.querySelector("#budgetTotalValue");
  dom.suggestedPriceValue = document.querySelector("#suggestedPriceValue");
  dom.discountAmountValue = document.querySelector("#discountAmountValue");
  dom.finalPriceValue = document.querySelector("#finalPriceValue");
  dom.duplicateBudgetButton = document.querySelector("#duplicateBudgetButton");
  dom.newBudgetButton = document.querySelector("#newBudgetButton");
  dom.exportPdfButton = document.querySelector("#exportPdfButton");
  dom.clientExportPdfButton = document.querySelector("#clientExportPdfButton");
  dom.clearBudgetSearchButton = document.querySelector("#clearBudgetSearchButton");
  dom.clearCartButton = document.querySelector("#clearCartButton");
  dom.budgetSearchInput = document.querySelector("#budgetSearchInput");
  dom.budgetCategoryFilters = document.querySelector("#budgetCategoryFilters");
  dom.stockPickerList = document.querySelector("#stockPickerList");
  dom.cartSheet = document.querySelector("#cartSheet");
  dom.cartSheetBackdrop = document.querySelector("#cartSheetBackdrop");
  dom.closeCartSheetButton = document.querySelector("#closeCartSheetButton");
  dom.cartFabButton = document.querySelector("#cartFabButton");
  dom.cartFabBadge = document.querySelector("#cartFabBadge");
  dom.cartFabTotal = document.querySelector("#cartFabTotal");
  dom.cartList = document.querySelector("#cartList");
  dom.exportInventoryBackupButton = document.querySelector("#exportInventoryBackupButton");
  dom.importInventoryBackupButton = document.querySelector("#importInventoryBackupButton");
  dom.inventoryBackupFileInput = document.querySelector("#inventoryBackupFileInput");
  dom.restoreReferenceStockButton = document.querySelector("#restoreReferenceStockButton");
  dom.backupStatus = document.querySelector("#backupStatus");
  dom.reportsInventoryCounter = document.querySelector("#reportsInventoryCounter");
  dom.dashboardTotalInvestedValue = document.querySelector("#dashboardTotalInvestedValue");
  dom.dashboardTopCategoryName = document.querySelector("#dashboardTopCategoryName");
  dom.dashboardTopCategoryValue = document.querySelector("#dashboardTopCategoryValue");
  dom.dashboardBudgetCount = document.querySelector("#dashboardBudgetCount");
  dom.dashboardBudgetInsight = document.querySelector("#dashboardBudgetInsight");
  dom.dashboardCategoryChart = document.querySelector("#dashboardCategoryChart");
  dom.homeInventoryCount = document.querySelector("#homeInventoryCount");
  dom.homeStockValue = document.querySelector("#homeStockValue");
  dom.homeBudgetCount = document.querySelector("#homeBudgetCount");
  dom.homeLowStockCount = document.querySelector("#homeLowStockCount");
  dom.mobileBudgetSummary = document.querySelector("#mobileBudgetSummary");
  dom.mobileBudgetSummaryValue = document.querySelector("#mobileBudgetSummaryValue");
  dom.mobileBudgetSummaryCount = document.querySelector("#mobileBudgetSummaryCount");
  dom.mobileExportPdfButton = document.querySelector("#mobileExportPdfButton");
  dom.mobileClientPdfButton = document.querySelector("#mobileClientPdfButton");
  dom.mobileDuplicateBudgetButton = document.querySelector("#mobileDuplicateBudgetButton");
  dom.mobileNewBudgetButton = document.querySelector("#mobileNewBudgetButton");
}

function bindEvents() {
  dom.openSidebarButton.addEventListener("click", openSidebar);
  dom.drawerBackdrop.addEventListener("click", closeSidebar);
  document.addEventListener("click", handleNavigationClick);
  dom.quickNewItemButton.addEventListener("click", () => openItemModal());
  dom.openItemModalButton.addEventListener("click", () => openItemModal());
  dom.closeItemModalButton.addEventListener("click", () => closeModal(dom.itemModal));
  dom.resetItemFormButton.addEventListener("click", resetItemForm);
  dom.categoryChoiceGrid.addEventListener("click", handleCategoryChoiceClick);
  dom.dynamicFieldsGrid.addEventListener("input", updateUnitCostPreview);
  dom.dynamicFieldsGrid.addEventListener("change", handleDynamicFieldsChange);
  dom.itemForm.addEventListener("submit", handleItemFormSubmit);
  dom.inventorySearchInput.addEventListener("input", (event) => {
    inventorySearchTerm = event.target.value;
    renderInventory();
  });
  dom.clearInventorySearchButton.addEventListener("click", clearInventoryFilters);
  dom.inventoryCategoryFilters.addEventListener("click", handleInventoryFilterClick);
  dom.inventoryGrid.addEventListener("click", handleInventoryGridClick);
  dom.budgetNameInput.addEventListener("input", updateBudgetIdentity);
  dom.clientNameInput.addEventListener("input", updateBudgetIdentity);
  dom.hourlyRateInput.addEventListener("input", updateBudgetLabor);
  dom.sessionDurationInput.addEventListener("input", updateBudgetLabor);
  dom.profitMarginInput.addEventListener("input", updateBudgetProfitMargin);
  dom.profitMarginTypeSelect?.addEventListener("change", updateBudgetProfitMargin);
  dom.discountPercentInput.addEventListener("input", updateBudgetDiscount);
  dom.discountTypeSelect?.addEventListener("change", updateBudgetDiscount);
  dom.referenceImageInput.addEventListener("change", handleReferenceImageChange);
  dom.removeReferenceImageButton.addEventListener("click", removeReferenceImage);
  dom.duplicateBudgetButton.addEventListener("click", duplicateActiveBudget);
  dom.newBudgetButton.addEventListener("click", createNewBudget);
  dom.exportPdfButton.addEventListener("click", exportPdf);
  dom.clientExportPdfButton.addEventListener("click", exportClientPdf);
  dom.mobileExportPdfButton.addEventListener("click", exportPdf);
  dom.mobileClientPdfButton.addEventListener("click", exportClientPdf);
  dom.mobileDuplicateBudgetButton?.addEventListener("click", duplicateActiveBudget);
  dom.mobileNewBudgetButton?.addEventListener("click", createNewBudget);
  dom.budgetSearchInput.addEventListener("input", (event) => {
    budgetSearchTerm = event.target.value;
    renderStockPicker();
  });
  dom.clearBudgetSearchButton.addEventListener("click", () => {
    budgetSearchTerm = "";
    dom.budgetSearchInput.value = "";
    renderStockPicker();
  });
  dom.clearCartButton.addEventListener("click", clearActiveBudgetCart);
  dom.cartFabButton.addEventListener("click", openCartSheet);
  dom.closeCartSheetButton.addEventListener("click", closeCartSheet);
  dom.cartSheetBackdrop.addEventListener("click", closeCartSheet);
  dom.budgetCategoryFilters.addEventListener("click", handleBudgetFilterClick);
  dom.stockPickerList.addEventListener("click", handleStockPickerClick);
  dom.stockPickerList.addEventListener("change", handlePickerQuantityChange);
  dom.cartList.addEventListener("click", handleCartClick);
  dom.cartList.addEventListener("change", handleCartQuantityChange);
  dom.exportInventoryBackupButton.addEventListener("click", exportInventoryToJSON);
  dom.importInventoryBackupButton.addEventListener("click", () => dom.inventoryBackupFileInput.click());
  dom.inventoryBackupFileInput.addEventListener("change", handleInventoryBackupFileChange);
  dom.restoreReferenceStockButton.addEventListener("click", restoreReferenceStock);
  window.addEventListener("hashchange", handleHashChange);
  document.addEventListener("click", handleDocumentClick);
}

function handleNavigationClick(event) {
  const clickedElement = event.target instanceof Element ? event.target : null;

  if (!clickedElement) {
    return;
  }

  const screenTargetButton = clickedElement.closest("[data-screen-target]");

  if (screenTargetButton) {
    event.preventDefault();
    setActiveScreen(screenTargetButton.dataset.screenTarget);
    return;
  }

  const homeActionButton = clickedElement.closest("[data-home-action]");

  if (!homeActionButton) {
    return;
  }

  event.preventDefault();
  setActiveScreen(homeActionButton.dataset.homeAction);
}

function getInitialScreen() {
  return getScreenFromHash() || "home";
}

function getScreenFromHash() {
  const normalizedHash = sanitizeText(window.location.hash).replace(/^#/, "").toLowerCase();
  return HASH_SCREEN_MAP[normalizedHash] || "";
}

function updateScreenHash(screenName) {
  const screenHash = SCREEN_HASHES[screenName] || screenName;
  const nextHash = `#${screenHash}`;

  if (window.location.hash !== nextHash) {
    window.history.pushState(null, "", nextHash);
  }
}

function handleHashChange() {
  const screenFromHash = getScreenFromHash();

  if (screenFromHash && screenFromHash !== activeScreen) {
    setActiveScreen(screenFromHash, { skipHashUpdate: true });
  }
}

function applyThemeColor() {
  if (dom.themeColorMeta) {
    dom.themeColorMeta.setAttribute("content", THEME_COLOR);
  }
}

function handleReactiveStateChange() {
  if (!isReactiveRenderingEnabled || !appState) {
    return;
  }

  scheduleSaveAppState(appState);

  if (!reactiveRenderFrameId) {
    reactiveRenderFrameId = window.requestAnimationFrame(() => {
      reactiveRenderFrameId = 0;
      renderApp();
    });
  }
}

function createInitialState() {
  return {
    inventoryItems: createReferenceStockItems(),
    budgets: [{ ...DEFAULT_BUDGET, items: [] }],
    activeBudgetId: DEFAULT_BUDGET.id
  };
}

function normalizeAppState(rawState) {
  const inventorySource = Array.isArray(rawState.inventoryItems) ? rawState.inventoryItems : DEFAULT_REFERENCE_STOCK;
  const budgetsSource = Array.isArray(rawState.budgets) && rawState.budgets.length > 0 ? rawState.budgets : [DEFAULT_BUDGET];
  const budgets = budgetsSource.map(normalizeBudget);
  const activeBudgetId = budgets.some((budget) => budget.id === rawState.activeBudgetId) ? rawState.activeBudgetId : budgets[0].id;

  return {
    inventoryItems: inventorySource.map(normalizeInventoryItem),
    budgets,
    activeBudgetId
  };
}

function normalizeInventoryItem(item) {
  const category = normalizeCategory(item.category);
  const categoryDefinition = CATEGORY_DEFINITIONS[category];
  const purchaseMode = UNIT_PURCHASE_CATEGORIES.includes(category) ? getNormalizedPurchaseMode(item) : "";
  const measureUnit = getNormalizedMeasureUnit(item, category, categoryDefinition.defaultMeasure);
  const packageQuantity = purchaseMode === PURCHASE_MODE_SINGLE ? 1 : getNormalizedPackageQuantity(item);
  const packagePrice = getNormalizedPackagePrice(item, purchaseMode);
  const stockQuantity = getNormalizedStockQuantity(item);
  const name = sanitizeText(item.name || item.nome || item.description || item.descricao) || "Novo item";

  return {
    id: item.id || createId("item"),
    category,
    name,
    brand: sanitizeText(item.brand || item.marca),
    color: sanitizeText(item.color || item.tipo || item.colorName || item.coloracao),
    purchaseMode,
    packageQuantity,
    packagePrice,
    stockQuantity,
    unitPrice: calculateRawUnitCost(packagePrice, packageQuantity),
    measureUnit,
    calculationType: categoryDefinition.calculationType,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  };
}

function getNormalizedPurchaseMode(item) {
  const rawPurchaseMode = sanitizeText(item.purchaseMode).toLowerCase();
  const isSingle = rawPurchaseMode === PURCHASE_MODE_SINGLE || rawPurchaseMode === "unit" || rawPurchaseMode.includes("unidade");
  const isBox = rawPurchaseMode === PURCHASE_MODE_BOX || rawPurchaseMode.includes("caixa") || rawPurchaseMode.includes("pacote");

  if (isBox) {
    return PURCHASE_MODE_BOX;
  }

  if (isSingle) {
    return PURCHASE_MODE_SINGLE;
  }

  return normalizeNumber(item.packageQuantity || item.quantity || item.quantidade) > 1 ? PURCHASE_MODE_BOX : PURCHASE_MODE_SINGLE;
}

function getNormalizedPackageQuantity(item) {
  const value = normalizeNumber(item.packageQuantity || item.currentStock || item.quantity || item.quantidade);
  return value > 0 ? value : 1;
}

function getNormalizedPackagePrice(item, purchaseMode) {
  if (purchaseMode === PURCHASE_MODE_SINGLE) {
    return Math.max(normalizeNumber(item.singleUnitPrice || item.unitPrice || item.packagePrice || item.purchasePrice || item.valor || item.price), 0);
  }

  return Math.max(normalizeNumber(item.packagePrice || item.purchasePrice || item.valor || item.price), 0);
}

function getNormalizedStockQuantity(item) {
  const stockQuantity = normalizeNumber(item.stockQuantity ?? item.inventoryQuantity ?? item.quantityInStock ?? item.qtdEstoque ?? item.estoque);
  return stockQuantity > 0 ? stockQuantity : 0;
}

function getNormalizedMeasureUnit(item, category, fallbackUnit) {
  if (category === CATEGORY_BLANK_PRODUCTS) {
    return MEASURE_UNIT;
  }

  return normalizeMeasureUnit(item.measureUnit || item.unitMeasure || item.unitLabel || item.tipoUnidade, fallbackUnit);
}

function normalizeBudget(budget) {
  const profitMarginValue = normalizeNumber(budget.profitMarginValue ?? budget.profitMarginPercent ?? budget.marginPercent ?? budget.margemLucro);
  const discountValue = normalizeNumber(budget.discountValue ?? budget.discountPercent ?? budget.descontoPercentual ?? budget.desconto);

  return {
    id: budget.id || createId("budget"),
    name: sanitizeText(budget.name || budget.projectName) || "Novo orçamento",
    clientName: sanitizeText(budget.clientName || budget.customerName || budget.nomeCliente),
    hourlyRate: normalizeNumber(budget.hourlyRate || budget.laborCost || budget.valorMaoDeObra || budget.valorHora),
    sessionDuration: normalizeNumber(budget.sessionDuration || budget.quantity || budget.sessionHours || budget.laborHours || budget.duracao),
    profitMarginValue,
    profitMarginType: normalizeAdjustmentType(budget.profitMarginType),
    profitMarginPercent: profitMarginValue,
    discountValue,
    discountType: normalizeAdjustmentType(budget.discountType),
    discountPercent: discountValue,
    referenceImage: isImageDataUrl(budget.referenceImage || budget.artImage) ? (budget.referenceImage || budget.artImage) : "",
    referenceImageName: sanitizeText(budget.referenceImageName || budget.artImageName),
    items: Array.isArray(budget.items) ? budget.items.map(normalizeBudgetItem) : []
  };
}

function normalizeBudgetItem(item) {
  return {
    id: item.id || createId("cart"),
    inventoryItemId: item.inventoryItemId,
    quantityUsed: normalizeNumber(item.quantityUsed)
  };
}

function createReferenceStockItems() {
  return DEFAULT_REFERENCE_STOCK.map((item) => normalizeInventoryItem({ ...item }));
}

function createInventoryBackupPayload(inventoryItems) {
  const normalizedItems = inventoryItems.map(createSerializableInventoryItem);

  return {
    appName: BACKUP_APP_NAME,
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    itemCount: normalizedItems.length,
    inventoryItems: normalizedItems
  };
}

function createSerializableInventoryItem(item) {
  const normalizedItem = normalizeInventoryItem(item);

  return {
    id: normalizedItem.id,
    category: normalizedItem.category,
    name: normalizedItem.name,
    brand: normalizedItem.brand,
    color: normalizedItem.color,
    purchaseMode: normalizedItem.purchaseMode,
    packageQuantity: normalizedItem.packageQuantity,
    packagePrice: normalizedItem.packagePrice,
    stockQuantity: normalizedItem.stockQuantity,
    unitPrice: normalizedItem.unitPrice,
    measureUnit: normalizedItem.measureUnit,
    calculationType: normalizedItem.calculationType,
    createdAt: normalizedItem.createdAt,
    updatedAt: normalizedItem.updatedAt
  };
}

function parseInventoryBackupPayload(rawBackupData) {
  const parsedPayload = JSON.parse(rawBackupData);

  if (!isValidInventoryBackupPayload(parsedPayload)) {
    throw new Error("Invalid inventory backup.");
  }

  return parsedPayload.inventoryItems.map((item) => normalizeInventoryItem(item));
}

function isValidInventoryBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const hasValidHeader = payload.appName === BACKUP_APP_NAME
    && payload.schema === BACKUP_SCHEMA
    && payload.version === BACKUP_VERSION
    && Array.isArray(payload.inventoryItems);

  if (!hasValidHeader) {
    return false;
  }

  if (Number.isFinite(payload.itemCount) && payload.itemCount !== payload.inventoryItems.length) {
    return false;
  }

  return payload.inventoryItems.every(isValidBackupInventoryItem);
}

function isValidBackupInventoryItem(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  const category = normalizeCategory(item.category);
  const hasSupportedCategory = getBusinessCategories().includes(category);
  const hasRequiredShape = sanitizeText(item.name)
    && normalizeNumber(item.packageQuantity) > 0
    && normalizeNumber(item.packagePrice) >= 0
    && normalizeNumber(item.stockQuantity) >= 0;

  return Boolean(hasSupportedCategory && hasRequiredShape);
}

function exportInventoryToJSON() {
  const backupPayload = createInventoryBackupPayload(appState.inventoryItems);
  const backupContent = JSON.stringify(backupPayload, null, 2);
  const backupFileName = `${BACKUP_FILE_PREFIX}_${formatBackupTimestamp(new Date())}.json`;
  downloadTextFile(backupFileName, backupContent, "application/json");
  showBackupStatus(`${backupPayload.itemCount} ${backupPayload.itemCount === 1 ? "item exportado" : "itens exportados"}.`);
  showAppToast("Backup JSON exportado.");
}

function importInventoryFromJSON(backupFile) {
  return new Promise((resolve, reject) => {
    if (!backupFile || !backupFile.name.toLowerCase().endsWith(".json")) {
      reject(new Error("Invalid backup file."));
      return;
    }

    const fileReader = new FileReader();
    fileReader.addEventListener("load", () => {
      try {
        resolve(parseInventoryBackupPayload(String(fileReader.result || "")));
      } catch (error) {
        reject(error);
      }
    });
    fileReader.addEventListener("error", () => reject(new Error("Backup reading failed.")));
    fileReader.readAsText(backupFile);
  });
}

function handleInventoryBackupFileChange(event) {
  const backupFile = event.target.files?.[0];

  if (!backupFile) {
    return;
  }

  importInventoryFromJSON(backupFile)
    .then((inventoryItems) => {
      applyImportedInventoryItems(inventoryItems);
      showBackupStatus(`${inventoryItems.length} ${inventoryItems.length === 1 ? "item importado" : "itens importados"}.`);
      showAppToast("Backup importado com sucesso.");
    })
    .catch(() => {
      showBackupStatus("Backup inválido ou incompatível.");
      showAppToast("Backup inválido ou incompatível.", "danger");
    })
    .finally(() => {
      event.target.value = "";
    });
}

function applyImportedInventoryItems(inventoryItems) {
  appState.inventoryItems = inventoryItems.map((item) => normalizeInventoryItem(item));
  synchronizeBudgetsWithInventory();
  activeInventoryCategory = CATEGORY_ALL;
  activeBudgetCategory = CATEGORY_ALL;
  inventorySearchTerm = "";
  budgetSearchTerm = "";
  dom.inventorySearchInput.value = "";
  dom.budgetSearchInput.value = "";
  saveAppState();
  renderApp();
}

function restoreReferenceStock() {
  const shouldRestore = window.confirm("Restaurar o estoque base vai substituir o estoque atual pelos itens iniciais zerados. Deseja continuar?");

  if (!shouldRestore) {
    return;
  }

  applyImportedInventoryItems(createReferenceStockItems());
  showBackupStatus(`${DEFAULT_REFERENCE_STOCK.length} itens restaurados.`);
  showAppToast("Estoque base restaurado.");
  closeSidebar();
}

function synchronizeBudgetsWithInventory() {
  const availableInventoryIds = new Set(appState.inventoryItems.map((item) => item.id));
  appState.budgets = appState.budgets.map((budget) => ({
    ...budget,
    items: budget.items.filter((cartItem) => availableInventoryIds.has(cartItem.inventoryItemId))
  }));
}

function downloadTextFile(fileName, content, mimeType) {
  const fileBlob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const fileUrl = URL.createObjectURL(fileBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = fileUrl;
  downloadLink.download = fileName;
  downloadLink.rel = "noopener";
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(fileUrl);
}

function formatBackupTimestamp(date) {
  const dateParts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  ];

  return dateParts.map((datePart) => String(datePart).padStart(2, "0")).join("_");
}

function showBackupStatus(message) {
  if (!dom.backupStatus) {
    return;
  }

  window.clearTimeout(backupStatusTimeoutId);
  dom.backupStatus.textContent = message;
  backupStatusTimeoutId = window.setTimeout(() => {
    dom.backupStatus.textContent = "";
  }, 4200);
}

function showAppToast(message, tone = "success") {
  window.clearTimeout(appToastTimeoutId);
  document.querySelector("#appToast")?.remove();

  const toast = document.createElement("div");
  toast.id = "appToast";
  toast.className = `app-toast is-${escapeAttribute(tone)}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.append(toast);

  appToastTimeoutId = window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

function saveAppState() {
  scheduleSaveAppState(appState);
}

function updateAppStateWithoutFullRender(updateCallback) {
  const previousReactiveState = isReactiveRenderingEnabled;
  isReactiveRenderingEnabled = false;
  try {
    updateCallback();
  } finally {
    isReactiveRenderingEnabled = previousReactiveState;
  }
  saveAppState();
}

function scheduleBudgetInputRefresh() {
  window.clearTimeout(budgetInputDebounceTimeoutId);
  budgetInputDebounceTimeoutId = window.setTimeout(() => {
    renderBudgetTotalsOnly();
    renderDashboard();
    renderHomeStats();
  }, BUDGET_INPUT_DEBOUNCE_MS);
}

function renderApp() {
  renderActiveScreen();
  renderCategoryChoices();
  renderDynamicForm();
  renderInventoryFilters();
  renderBudgetFilters();
  renderInventory();
  renderBudget();
  renderDashboard();
  renderHomeStats();
  renderLucideIcons();
}

function renderActiveScreen() {
  const screenMeta = SCREEN_META[activeScreen] || SCREEN_META.home;
  dom.pageTitle.textContent = screenMeta.title;
  dom.pageEyebrow.textContent = screenMeta.eyebrow;
  dom.screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === activeScreen);
  });
  dom.navLinks.forEach((navLink) => {
    navLink.classList.toggle("is-active", navLink.dataset.screenTarget === activeScreen);
  });
  dom.quickNewItemButton.hidden = activeScreen !== "inventory";
  const isBudgetScreen = activeScreen === "budget";
  document.body.classList.toggle("has-mobile-budget-summary", isBudgetScreen);
  document.body.classList.toggle("has-cart-fab", isBudgetScreen);
  document.body.classList.toggle("has-order-slip-fab", isBudgetScreen);
  dom.mobileBudgetSummary.hidden = !isBudgetScreen;
  dom.cartFabButton.hidden = !isBudgetScreen;

  if (!isBudgetScreen) {
    closeCartSheet();
  }
}

function renderCategoryChoices() {
  dom.categoryChoiceGrid.innerHTML = getBusinessCategories().map((categoryName) => {
    const categoryDefinition = CATEGORY_DEFINITIONS[categoryName];
    const isActive = selectedFormCategory === categoryName;
    return `
      <button class="category-choice ${isActive ? "is-active" : ""}" type="button" data-form-category="${escapeHtml(categoryName)}">
        <span class="category-choice-icon">${createIconHtml(getCategoryIconName(categoryName))}</span>
        <strong>${escapeHtml(categoryDefinition.label)}</strong>
        <span>${escapeHtml(categoryDefinition.helper)}</span>
      </button>
    `;
  }).join("");
  renderLucideIcons();
}

function renderDynamicForm(item = null) {
  const categoryDefinition = CATEGORY_DEFINITIONS[selectedFormCategory];
  const formData = readDynamicFormData();
  const renderItem = item || createVirtualItemFromFormData(formData);
  dom.dynamicFormTitle.textContent = `${categoryDefinition.label}: ficha do item`;
  dom.dynamicFieldsGrid.innerHTML = categoryDefinition.fields
    .filter((field) => isFieldVisible(field, renderItem, formData))
    .map((field) => createDynamicFieldHtml(field, renderItem))
    .join("");
  updateUnitCostPreview();
}

function createVirtualItemFromFormData(formData) {
  return {
    ...formData,
    measureUnit: formData.measureUnit || CATEGORY_DEFINITIONS[selectedFormCategory].defaultMeasure,
    purchaseMode: formData.purchaseMode || PURCHASE_MODE_SINGLE
  };
}

function isFieldVisible(field, item, formData) {
  if (!field.visibleWhen) {
    return true;
  }

  const currentValue = sanitizeText(formData[field.visibleWhen.key] || item?.[field.visibleWhen.key] || PURCHASE_MODE_SINGLE);
  return currentValue === field.visibleWhen.value;
}

function createDynamicFieldHtml(field, item) {
  const value = getFieldValueForRender(field, item);
  const requiredAttribute = field.required ? "required" : "";
  const inputMode = field.inputMode ? `inputmode="${escapeHtml(field.inputMode)}"` : "";

  if (field.type === "select") {
    const selectedValue = sanitizeText(value || field.options[0]?.value);
    return `
      <label class="form-field">
        <span>${escapeHtml(field.label)}</span>
        <select data-item-field="${escapeHtml(field.key)}" ${requiredAttribute}>
          ${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "measure") {
    const selectedUnit = item?.measureUnit || CATEGORY_DEFINITIONS[selectedFormCategory].defaultMeasure;
    return `
      <label class="form-field measure-field">
        <span>${escapeHtml(field.label)}</span>
        <div class="measure-input-group">
          <input data-item-field="${escapeHtml(field.key)}" type="text" ${inputMode} placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(value)}" ${requiredAttribute} />
          <select data-item-field="measureUnit" aria-label="Unidade de medida">
            ${field.options.map((optionValue) => `<option value="${escapeHtml(optionValue)}" ${optionValue === selectedUnit ? "selected" : ""}>${escapeHtml(getMeasureLabel(optionValue))}</option>`).join("")}
          </select>
        </div>
      </label>
    `;
  }

  return `
    <label class="form-field">
      <span>${escapeHtml(field.label)}</span>
      <input data-item-field="${escapeHtml(field.key)}" type="text" ${inputMode} placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(value)}" ${requiredAttribute} />
    </label>
  `;
}

function getFieldValueForRender(field, item) {
  if (!item) {
    return "";
  }

  if (field.key === "packagePrice") {
    return formatEditableNumber(item.packagePrice);
  }

  if (field.key === "singleUnitPrice") {
    return item.singleUnitPrice ? formatEditableNumber(item.singleUnitPrice) : formatEditableNumber(calculateUnitCost(item));
  }

  if (field.key === "purchaseMode") {
    return item.purchaseMode || PURCHASE_MODE_SINGLE;
  }

  if (field.key === "packageQuantity") {
    return formatEditableNumber(item.packageQuantity);
  }

  if (field.key === "stockQuantity") {
    return formatEditableNumber(item.stockQuantity);
  }

  return item[field.key] || "";
}

function renderInventoryFilters() {
  renderFilterGroup(dom.inventoryCategoryFilters, activeInventoryCategory, "inventory-category");
}

function clearInventoryFilters() {
  inventorySearchTerm = "";
  activeInventoryCategory = CATEGORY_ALL;
  dom.inventorySearchInput.value = "";
  renderInventoryFilters();
  renderInventory();
  showAppToast("Filtros do estoque limpos.");
}

function renderBudgetFilters() {
  renderFilterGroup(dom.budgetCategoryFilters, activeBudgetCategory, "budget-category");
}

function renderFilterGroup(container, activeCategory, dataAttributeName) {
  container.innerHTML = CATEGORY_ORDER.map((categoryName) => {
    const categoryCount = countItemsByCategory(categoryName);
    const isActive = categoryName === activeCategory;
    return `
      <button class="filter-chip ${isActive ? "is-active" : ""}" type="button" data-${dataAttributeName}="${escapeHtml(categoryName)}">
        ${createIconHtml(getCategoryIconName(categoryName), "chip-icon")}
        <span>${escapeHtml(categoryName)}</span>
        <strong>${formatCompactCount(categoryCount)}</strong>
      </button>
    `;
  }).join("");
  renderLucideIcons();
}

function renderInventory() {
  const filteredItems = getFilteredInventoryItems(inventorySearchTerm, activeInventoryCategory);
  dom.inventoryCounter.textContent = formatItemsCounter(filteredItems.length, appState.inventoryItems.length);

  if (filteredItems.length === 0) {
    dom.inventoryGrid.innerHTML = createEmptyStateHtml("Nenhum item encontrado no estoque.");
    renderLucideIcons();
    return;
  }

  dom.inventoryGrid.innerHTML = filteredItems.map(createInventoryCardHtml).join("");
  renderLucideIcons();
}

function renderDashboard() {
  const dashboardMetrics = calculateDashboardMetrics();
  const topCategory = dashboardMetrics.categoryInvestments[0];
  dom.reportsInventoryCounter.textContent = formatCounter(appState.inventoryItems.length, appState.inventoryItems.length);
  dom.dashboardTotalInvestedValue.textContent = formatCurrency(dashboardMetrics.totalInventoryInvestment);
  dom.dashboardTopCategoryName.textContent = topCategory ? topCategory.category : "Sem valores";
  dom.dashboardTopCategoryValue.textContent = topCategory
    ? `${formatCurrency(topCategory.totalValue)} alocado nesta categoria.`
    : "R$ 0,00 alocado nesta categoria.";
  dom.dashboardBudgetCount.textContent = formatNumber(dashboardMetrics.generatedBudgetCount);
  dom.dashboardBudgetInsight.textContent = dashboardMetrics.generatedBudgetCount > 0
    ? `${formatNumber(dashboardMetrics.generatedBudgetCount)} ${dashboardMetrics.generatedBudgetCount === 1 ? "orçamento preenchido" : "orçamentos preenchidos"} no histórico local.`
    : "Nenhum orçamento preenchido ainda.";
  dom.dashboardCategoryChart.innerHTML = createDashboardCategoryChartHtml(dashboardMetrics.categoryInvestments);
}

function renderHomeStats() {
  const dashboardMetrics = calculateDashboardMetrics();
  const lowStockCount = appState.inventoryItems.filter(isLowStockItem).length;
  dom.homeInventoryCount.textContent = formatNumber(appState.inventoryItems.length);
  dom.homeStockValue.textContent = formatCurrency(dashboardMetrics.totalInventoryInvestment);
  dom.homeBudgetCount.textContent = formatNumber(dashboardMetrics.generatedBudgetCount);
  dom.homeLowStockCount.textContent = formatNumber(lowStockCount);
}

function createDashboardCategoryChartHtml(categoryInvestments) {
  if (categoryInvestments.length === 0) {
    return createEmptyStateHtml("Preencha custos no estoque para visualizar o investimento por categoria.");
  }

  const highestValue = Math.max(...categoryInvestments.map((categoryInvestment) => categoryInvestment.totalValue), 1);

  return categoryInvestments.map((categoryInvestment) => {
    const percentageValue = Math.round((categoryInvestment.totalValue / highestValue) * 100);
    return `
      <article class="chart-row">
        <div class="chart-row-heading">
          <strong>${escapeHtml(categoryInvestment.category)}</strong>
          <span>${formatCurrency(categoryInvestment.totalValue)}</span>
        </div>
        <div class="chart-track" aria-hidden="true">
          <span style="width: ${percentageValue}%"></span>
        </div>
      </article>
    `;
  }).join("");
}

function createInventoryCardHtml(item) {
  const unitCost = calculateUnitCost(item);
  const stockQuantity = normalizeNumber(item.stockQuantity);
  const stockLabel = `${formatNumber(stockQuantity)} ${getMeasureSuffix(item.measureUnit) || getMeasureLabel(item.measureUnit)}`;
  const itemSpecification = getItemSpecification(item);
  const categoryLine = itemSpecification
    ? `${item.category} · ${itemSpecification}`
    : item.category;

  return `
    <article class="inventory-card inventory-card-compact" data-inventory-item-id="${escapeHtml(item.id)}">
      <div class="inventory-card-main">
        <div class="inventory-card-info">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="inventory-card-category">${escapeHtml(categoryLine)}</span>
        </div>
        <div class="inventory-card-data-grid" aria-label="Resumo do item em estoque">
          <div class="inventory-card-data">
            <span>Valor unitário</span>
            <strong>${formatCurrency(unitCost)}</strong>
          </div>
          <div class="inventory-card-data">
            <span>Disponível</span>
            <strong>${escapeHtml(stockLabel)}</strong>
          </div>
        </div>
      </div>
      <div class="card-menu compact-action-menu" data-card-menu>
        <button class="card-menu-toggle" type="button" data-inventory-action-menu aria-expanded="false" aria-label="Abrir opções de ${escapeHtml(item.name)}">
          ${createIconHtml("settings")}<span class="visually-hidden">Opções</span>
        </button>
        <div class="card-menu-panel" data-card-menu-panel hidden>
          <button type="button" data-inventory-action="edit">${createIconHtml("pencil")}Editar</button>
          <button type="button" data-inventory-action="delete">${createIconHtml("trash-2")}Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function createLowStockTagHtml(item) {
  if (!isLowStockItem(item)) {
    return "";
  }

  return `
    <span class="low-stock-tag">
      ${createIconHtml("alert-triangle")}
      Conferir estoque
    </span>
  `;
}

function isLowStockItem(item) {
  return normalizeNumber(item.stockQuantity) <= LOW_STOCK_THRESHOLD;
}

function renderBudget() {
  const activeBudget = getActiveBudget();
  const budgetTotals = calculateBudgetTotals(activeBudget);
  dom.budgetNameInput.value = activeBudget.name;
  dom.clientNameInput.value = activeBudget.clientName;
  dom.hourlyRateInput.value = activeBudget.hourlyRate > 0 ? formatEditableNumber(activeBudget.hourlyRate) : "";
  dom.sessionDurationInput.value = activeBudget.sessionDuration > 0 ? formatEditableNumber(activeBudget.sessionDuration) : "";
  dom.profitMarginInput.value = activeBudget.profitMarginValue > 0 ? formatEditableNumber(activeBudget.profitMarginValue) : "";
  dom.profitMarginTypeSelect.value = activeBudget.profitMarginType || ADJUSTMENT_PERCENT;
  dom.discountPercentInput.value = activeBudget.discountValue > 0 ? formatEditableNumber(activeBudget.discountValue) : "";
  dom.discountTypeSelect.value = activeBudget.discountType || ADJUSTMENT_PERCENT;
  dom.materialTotalValue.textContent = formatCurrency(budgetTotals.materialCost);
  dom.laborTotalValue.textContent = formatCurrency(budgetTotals.laborCost);
  dom.budgetTotalValue.textContent = formatCurrency(budgetTotals.totalCost);
  dom.suggestedPriceValue.textContent = formatCurrency(budgetTotals.suggestedPrice);
  dom.discountAmountValue.textContent = formatCurrency(budgetTotals.discountAmount);
  dom.finalPriceValue.textContent = formatCurrency(budgetTotals.finalPrice);
  dom.budgetCounter.textContent = formatItemsCounter(activeBudget.items.length, activeBudget.items.length);
  renderMobileBudgetSummary(activeBudget, budgetTotals);
  renderCartFab(activeBudget, budgetTotals);
  renderReferencePreview();
  renderStockPicker();
  renderCart();
  renderLucideIcons();
}

function renderReferencePreview() {
  const activeBudget = getActiveBudget();

  if (!activeBudget.referenceImage) {
    dom.referencePreview.hidden = true;
    dom.referencePreview.innerHTML = "";
    return;
  }

  dom.referencePreview.hidden = false;
  dom.referencePreview.innerHTML = `
    <img src="${escapeAttribute(activeBudget.referenceImage)}" alt="Imagem de referência da arte" />
    <figcaption>${escapeHtml(activeBudget.referenceImageName || "Referência adicionada")}</figcaption>
  `;
}

function renderStockPicker() {
  const filteredItems = getFilteredInventoryItems(budgetSearchTerm, activeBudgetCategory);

  if (filteredItems.length === 0) {
    dom.stockPickerList.innerHTML = createEmptyStateHtml("Nenhum item encontrado para adicionar ao orçamento.");
    renderLucideIcons();
    return;
  }

  dom.stockPickerList.innerHTML = filteredItems.map((item) => {
    const usageRules = getUsageRules(item);
    const suffix = getMeasureSuffix(item.measureUnit);
    return `
      <article class="picker-card ${recentlyAddedInventoryItemId === item.id ? "is-added-feedback" : ""}" data-inventory-item-id="${escapeHtml(item.id)}">
        <div class="picker-info">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.category)} · ${escapeHtml(getItemSpecification(item))}</span>
          <small>${formatCurrency(calculateUnitCost(item))} por ${escapeHtml(getMeasureLabel(item.measureUnit))}</small>
        </div>
        <div class="picker-actions">
          <label class="stepper-field">
            <span>Quantidade usada</span>
            <div class="quantity-stepper ${suffix ? "has-suffix" : ""}" data-suffix="${escapeHtml(suffix)}">
              <button type="button" data-picker-step="decrease" aria-label="Diminuir quantidade">${createIconHtml("minus")}</button>
              <input data-picker-quantity type="text" inputmode="${usageRules.inputMode}" value="${formatEditableNumber(usageRules.defaultValue)}" />
              <button type="button" data-picker-step="increase" aria-label="Aumentar quantidade">${createIconHtml("plus")}</button>
            </div>
          </label>
          <button class="primary-button" type="button" data-add-to-budget>${createIconHtml("shopping-cart")}Adicionar ao Orçamento</button>
        </div>
      </article>
    `;
  }).join("");
  renderLucideIcons();
}

function renderCart() {
  const activeBudget = getActiveBudget();
  const cartEntries = activeBudget.items
    .map((cartItem) => ({ cartItem, inventoryItem: findInventoryItem(cartItem.inventoryItemId) }))
    .filter((entry) => entry.inventoryItem);
  dom.clearCartButton.disabled = cartEntries.length === 0;

  if (cartEntries.length === 0) {
    dom.cartList.innerHTML = createEmptyStateHtml("Nenhum item adicionado ao orçamento.");
    renderLucideIcons();
    return;
  }

  dom.cartList.innerHTML = cartEntries.map(({ cartItem, inventoryItem }) => {
    const suffix = getMeasureSuffix(inventoryItem.measureUnit);
    const subtotal = calculateLineSubtotal(inventoryItem, cartItem.quantityUsed);
    const usageRules = getUsageRules(inventoryItem);
    return `
      <article class="cart-line ${recentlyAddedCartItemId === cartItem.id ? "is-just-added" : ""}" data-cart-item-id="${escapeHtml(cartItem.id)}">
        <div>
          <strong>${escapeHtml(inventoryItem.name)}</strong>
          <span>${escapeHtml(getItemSpecification(inventoryItem))} · ${formatCurrency(calculateUnitCost(inventoryItem))}/${escapeHtml(getMeasureLabel(inventoryItem.measureUnit))}</span>
        </div>
        <label class="stepper-field compact-stepper-field">
          <span>Uso</span>
          <div class="quantity-stepper ${suffix ? "has-suffix" : ""}" data-suffix="${escapeHtml(suffix)}">
            <button type="button" data-cart-step="decrease" aria-label="Diminuir quantidade">${createIconHtml("minus")}</button>
            <input data-cart-quantity type="text" inputmode="${usageRules.inputMode}" value="${formatEditableNumber(cartItem.quantityUsed)}" />
            <button type="button" data-cart-step="increase" aria-label="Aumentar quantidade">${createIconHtml("plus")}</button>
          </div>
        </label>
        <strong class="line-subtotal">${formatCurrency(subtotal)}</strong>
        <button class="ghost-button" type="button" data-remove-cart-item>${createIconHtml("trash-2")}Remover</button>
      </article>
    `;
  }).join("");
  renderLucideIcons();
}

function setActiveScreen(screenName, options = {}) {
  const normalizedScreenName = normalizeScreenName(screenName);

  if (!Object.prototype.hasOwnProperty.call(SCREEN_META, normalizedScreenName)) {
    return;
  }

  activeScreen = normalizedScreenName;

  if (!options.skipHashUpdate) {
    updateScreenHash(normalizedScreenName);
  }

  renderActiveScreen();
  renderDashboard();
  renderHomeStats();
  closeSidebar();
}

function normalizeScreenName(screenName) {
  const normalizedScreenName = sanitizeText(screenName).toLowerCase();
  return HASH_SCREEN_MAP[normalizedScreenName] || normalizedScreenName;
}

function openSidebar() {
  dom.sidebar.classList.add("is-open");
  dom.drawerBackdrop.hidden = false;
}

function closeSidebar() {
  dom.sidebar.classList.remove("is-open");
  dom.drawerBackdrop.hidden = true;
}

function openCartSheet() {
  renderCart();
  dom.cartSheet.hidden = false;
  dom.cartSheetBackdrop.hidden = false;
  document.body.classList.add("has-open-cart-sheet");
  renderLucideIcons();
}

function closeCartSheet() {
  if (!dom.cartSheet || !dom.cartSheetBackdrop) {
    return;
  }

  dom.cartSheet.hidden = true;
  dom.cartSheetBackdrop.hidden = true;
  document.body.classList.remove("has-open-cart-sheet");
}

function handleDynamicFieldsChange(event) {
  if (event.target.matches('[data-item-field="purchaseMode"]')) {
    renderDynamicForm();
    return;
  }

  updateUnitCostPreview();
}

function handleCategoryChoiceClick(event) {
  const categoryButton = event.target.closest("[data-form-category]");

  if (!categoryButton) {
    return;
  }

  selectedFormCategory = normalizeCategory(categoryButton.dataset.formCategory);
  renderCategoryChoices();
  renderDynamicForm();
}

function handleInventoryFilterClick(event) {
  const filterButton = event.target.closest("[data-inventory-category]");

  if (!filterButton) {
    return;
  }

  activeInventoryCategory = normalizeCategory(filterButton.dataset.inventoryCategory);
  renderInventoryFilters();
  renderInventory();
}

function handleBudgetFilterClick(event) {
  const filterButton = event.target.closest("[data-budget-category]");

  if (!filterButton) {
    return;
  }

  activeBudgetCategory = normalizeCategory(filterButton.dataset.budgetCategory);
  renderBudgetFilters();
  renderStockPicker();
}

function handleInventoryGridClick(event) {
  const menuToggleButton = event.target.closest("[data-inventory-action-menu]");

  if (menuToggleButton) {
    toggleInventoryActionMenu(menuToggleButton);
    return;
  }

  const actionButton = event.target.closest("[data-inventory-action]");

  if (!actionButton) {
    return;
  }

  const inventoryCard = actionButton.closest("[data-inventory-item-id]");
  const inventoryItemId = inventoryCard?.dataset.inventoryItemId;

  if (!inventoryItemId) {
    return;
  }

  if (actionButton.dataset.inventoryAction === "edit") {
    closeInventoryActionMenus();
    openItemModal(inventoryItemId);
    return;
  }

  if (actionButton.dataset.inventoryAction === "delete") {
    closeInventoryActionMenus();
    deleteInventoryItem(inventoryItemId);
  }
}

function handleDocumentClick(event) {
  if (event.target.closest("[data-card-menu]")) {
    return;
  }

  closeInventoryActionMenus();
}

function toggleInventoryActionMenu(menuToggleButton) {
  const cardMenu = menuToggleButton.closest("[data-card-menu]");
  const menuPanel = cardMenu?.querySelector("[data-card-menu-panel]");

  if (!cardMenu || !menuPanel) {
    return;
  }

  const shouldOpenMenu = menuPanel.hidden;
  const inventoryCard = cardMenu.closest("[data-inventory-item-id]");
  closeInventoryActionMenus(cardMenu);
  menuPanel.hidden = !shouldOpenMenu;
  cardMenu.classList.toggle("is-open", shouldOpenMenu);
  inventoryCard?.classList.toggle("is-menu-open", shouldOpenMenu);
  menuToggleButton.setAttribute("aria-expanded", String(shouldOpenMenu));
}

function closeInventoryActionMenus(exceptMenu = null) {
  dom.inventoryGrid?.querySelectorAll("[data-card-menu]").forEach((cardMenu) => {
    if (cardMenu === exceptMenu) {
      return;
    }

    const menuToggleButton = cardMenu.querySelector("[data-inventory-action-menu]");
    const menuPanel = cardMenu.querySelector("[data-card-menu-panel]");

    cardMenu.classList.remove("is-open");
    cardMenu.closest("[data-inventory-item-id]")?.classList.remove("is-menu-open");
    menuToggleButton?.setAttribute("aria-expanded", "false");

    if (menuPanel) {
      menuPanel.hidden = true;
    }
  });
}

function handleStockPickerClick(event) {
  const stepButton = event.target.closest("[data-picker-step]");

  if (stepButton) {
    const pickerCard = stepButton.closest("[data-inventory-item-id]");
    const inventoryItem = findInventoryItem(pickerCard?.dataset.inventoryItemId);
    const quantityInput = pickerCard?.querySelector("[data-picker-quantity]");

    if (inventoryItem && quantityInput) {
      quantityInput.value = formatEditableNumber(adjustQuantity(inventoryItem, quantityInput.value, stepButton.dataset.pickerStep, getMinimumQuantity(inventoryItem)));
    }
    return;
  }

  const addButton = event.target.closest("[data-add-to-budget]");

  if (!addButton) {
    return;
  }

  const pickerCard = addButton.closest("[data-inventory-item-id]");
  const quantityInput = pickerCard?.querySelector("[data-picker-quantity]");
  addItemToBudget(pickerCard?.dataset.inventoryItemId, quantityInput?.value);
}

function handlePickerQuantityChange(event) {
  if (!event.target.matches("[data-picker-quantity]")) {
    return;
  }

  const pickerCard = event.target.closest("[data-inventory-item-id]");
  const inventoryItem = findInventoryItem(pickerCard?.dataset.inventoryItemId);

  if (!inventoryItem) {
    return;
  }

  event.target.value = formatEditableNumber(sanitizeUsageQuantity(inventoryItem, event.target.value, getMinimumQuantity(inventoryItem)));
}

function handleCartClick(event) {
  const stepButton = event.target.closest("[data-cart-step]");

  if (stepButton) {
    const cartLine = stepButton.closest("[data-cart-item-id]");
    adjustCartQuantity(cartLine?.dataset.cartItemId, stepButton.dataset.cartStep);
    return;
  }

  const removeButton = event.target.closest("[data-remove-cart-item]");

  if (removeButton) {
    const cartLine = removeButton.closest("[data-cart-item-id]");
    removeCartItem(cartLine?.dataset.cartItemId);
  }
}

function handleCartQuantityChange(event) {
  if (!event.target.matches("[data-cart-quantity]")) {
    return;
  }

  const cartLine = event.target.closest("[data-cart-item-id]");
  updateCartQuantity(cartLine?.dataset.cartItemId, event.target.value);
}

function openItemModal(itemId = null) {
  const item = itemId ? findInventoryItem(itemId) : null;
  editingItemId = item?.id || null;
  selectedFormCategory = item?.category || CATEGORY_PRINT_SUPPLIES;
  dom.itemModalEyebrow.textContent = editingItemId ? "Editar item" : "Novo item";
  dom.itemModalTitle.textContent = editingItemId ? "Atualizar item" : "Cadastrar item";
  renderCategoryChoices();
  renderDynamicForm(item);
  openModal(dom.itemModal);
}

function closeModal(modalElement) {
  if (typeof modalElement.close === "function" && modalElement.open) {
    modalElement.close();
    return;
  }

  modalElement.removeAttribute("open");
}

function resetItemForm() {
  editingItemId = null;
  dom.itemModalEyebrow.textContent = "Novo item";
  dom.itemModalTitle.textContent = "Cadastrar item";
  renderDynamicForm();
  updateUnitCostPreview();
  renderLucideIcons();
  showAppToast("Formulário limpo.");
}

function openModal(modalElement) {
  if (typeof modalElement.showModal === "function") {
    modalElement.showModal();
    return;
  }

  modalElement.setAttribute("open", "");
}

function handleItemFormSubmit(event) {
  event.preventDefault();
  const inventoryItem = buildInventoryItemFromForm();
  const wasEditingItem = Boolean(editingItemId);

  if (!inventoryItem) {
    dom.itemForm.reportValidity();
    showAppToast("Confira nome e quantidade da embalagem antes de salvar.", "danger");
    return;
  }

  if (editingItemId) {
    appState.inventoryItems = appState.inventoryItems.map((item) => item.id === editingItemId ? inventoryItem : item);
  } else {
    appState.inventoryItems.unshift(inventoryItem);
  }

  editingItemId = null;
  saveAppState();
  closeModal(dom.itemModal);
  renderApp();
  showAppToast(wasEditingItem ? "Item atualizado." : "Item salvo no estoque.");
}

function buildInventoryItemFromForm() {
  const categoryDefinition = CATEGORY_DEFINITIONS[selectedFormCategory];
  const fieldData = readDynamicFormData();
  const existingItem = editingItemId ? findInventoryItem(editingItemId) : null;
  const purchaseMode = UNIT_PURCHASE_CATEGORIES.includes(selectedFormCategory) ? sanitizeText(fieldData.purchaseMode || PURCHASE_MODE_SINGLE) : "";
  const isSinglePurchase = purchaseMode === PURCHASE_MODE_SINGLE;
  const packageQuantity = isSinglePurchase ? 1 : normalizeNumber(fieldData.packageQuantity);
  const packagePrice = isSinglePurchase ? normalizeNumber(fieldData.singleUnitPrice) : normalizeNumber(fieldData.packagePrice);
  const stockQuantity = normalizeNumber(fieldData.stockQuantity);
  const measureUnit = getNormalizedMeasureUnit(fieldData, selectedFormCategory, categoryDefinition.defaultMeasure);

  if (packageQuantity <= 0 || packagePrice < 0 || stockQuantity < 0 || !validateRequiredFields(categoryDefinition.fields, fieldData)) {
    return null;
  }

  return normalizeInventoryItem({
    id: editingItemId || createId("item"),
    category: selectedFormCategory,
    name: buildItemName(selectedFormCategory, fieldData),
    brand: sanitizeText(fieldData.brand),
    color: sanitizeText(fieldData.color),
    purchaseMode,
    packageQuantity,
    packagePrice,
    stockQuantity,
    measureUnit,
    calculationType: categoryDefinition.calculationType,
    createdAt: existingItem?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function readDynamicFormData() {
  const formData = {};
  dom.dynamicFieldsGrid.querySelectorAll("[data-item-field]").forEach((fieldElement) => {
    formData[fieldElement.dataset.itemField] = fieldElement.value;
  });
  return formData;
}

function validateRequiredFields(fields, fieldData) {
  const virtualItem = createVirtualItemFromFormData(fieldData);
  return fields
    .filter((field) => isFieldVisible(field, virtualItem, fieldData))
    .every((field) => !field.required || sanitizeText(fieldData[field.key]));
}

function buildItemName(categoryName, fieldData) {
  return sanitizeText(fieldData.name) || CATEGORY_DEFINITIONS[categoryName].label;
}

function updateUnitCostPreview() {
  const fieldData = readDynamicFormData();
  const categoryDefinition = CATEGORY_DEFINITIONS[selectedFormCategory];
  const purchaseMode = UNIT_PURCHASE_CATEGORIES.includes(selectedFormCategory) ? sanitizeText(fieldData.purchaseMode || PURCHASE_MODE_SINGLE) : "";
  const isSinglePurchase = purchaseMode === PURCHASE_MODE_SINGLE;
  const packageQuantity = isSinglePurchase ? 1 : normalizeNumber(fieldData.packageQuantity);
  const packagePrice = isSinglePurchase ? normalizeNumber(fieldData.singleUnitPrice) : normalizeNumber(fieldData.packagePrice);
  const stockQuantity = normalizeNumber(fieldData.stockQuantity);
  const measureUnit = getNormalizedMeasureUnit(fieldData, selectedFormCategory, categoryDefinition.defaultMeasure);
  const unitCost = calculateRawUnitCost(packagePrice, packageQuantity);
  const totalInventoryValue = packagePrice * Math.max(stockQuantity, 0);
  dom.unitCostPreview.innerHTML = `
    <span>Custo por ${escapeHtml(getMeasureLabel(measureUnit))}</span>
    <strong>${formatCurrency(unitCost)}</strong>
    <small>Valor em estoque: ${formatCurrency(totalInventoryValue)}</small>
  `;
}

function deleteInventoryItem(itemId) {
  const inventoryItem = findInventoryItem(itemId);

  if (!inventoryItem) {
    return;
  }

  const shouldDelete = window.confirm(`Excluir "${inventoryItem.name}" também remove esse item dos orçamentos salvos. Deseja continuar?`);

  if (!shouldDelete) {
    return;
  }

  appState.inventoryItems = appState.inventoryItems.filter((item) => item.id !== itemId);
  appState.budgets = appState.budgets.map((budget) => ({
    ...budget,
    items: budget.items.filter((cartItem) => cartItem.inventoryItemId !== itemId)
  }));
  saveAppState();
  renderApp();
  showAppToast("Item excluído do estoque.");
}

function updateBudgetIdentity() {
  const activeBudget = getActiveBudget();

  updateAppStateWithoutFullRender(() => {
    activeBudget.name = sanitizeText(dom.budgetNameInput.value) || "Novo orçamento";
    activeBudget.clientName = sanitizeText(dom.clientNameInput.value);
  });
  scheduleBudgetInputRefresh();
}

function updateBudgetLabor() {
  const activeBudget = getActiveBudget();

  updateAppStateWithoutFullRender(() => {
    activeBudget.hourlyRate = normalizeNumber(dom.hourlyRateInput.value);
    activeBudget.sessionDuration = normalizeNumber(dom.sessionDurationInput.value);
  });
  scheduleBudgetInputRefresh();
}

function updateBudgetProfitMargin() {
  const activeBudget = getActiveBudget();

  updateAppStateWithoutFullRender(() => {
    activeBudget.profitMarginValue = normalizeNumber(dom.profitMarginInput.value);
    activeBudget.profitMarginType = normalizeAdjustmentType(dom.profitMarginTypeSelect?.value);
    activeBudget.profitMarginPercent = activeBudget.profitMarginValue;
  });
  scheduleBudgetInputRefresh();
}

function updateBudgetDiscount() {
  const activeBudget = getActiveBudget();

  updateAppStateWithoutFullRender(() => {
    activeBudget.discountValue = normalizeNumber(dom.discountPercentInput.value);
    activeBudget.discountType = normalizeAdjustmentType(dom.discountTypeSelect?.value);
    activeBudget.discountPercent = activeBudget.discountValue;
  });
  scheduleBudgetInputRefresh();
}

function renderBudgetTotalsOnly() {
  const activeBudget = getActiveBudget();
  const totals = calculateBudgetTotals(activeBudget);
  dom.materialTotalValue.textContent = formatCurrency(totals.materialCost);
  dom.laborTotalValue.textContent = formatCurrency(totals.laborCost);
  dom.budgetTotalValue.textContent = formatCurrency(totals.totalCost);
  dom.suggestedPriceValue.textContent = formatCurrency(totals.suggestedPrice);
  dom.discountAmountValue.textContent = formatCurrency(totals.discountAmount);
  dom.finalPriceValue.textContent = formatCurrency(totals.finalPrice);
  dom.budgetCounter.textContent = formatItemsCounter(activeBudget.items.length, activeBudget.items.length);
  renderMobileBudgetSummary(activeBudget, totals);
  renderCartFab(activeBudget, totals);
}

function renderMobileBudgetSummary(activeBudget, totals) {
  dom.mobileBudgetSummaryValue.textContent = formatCurrency(totals.finalPrice);
  dom.mobileBudgetSummaryCount.textContent = `${formatItemsCounter(activeBudget.items.length, activeBudget.items.length)} na fichinha`;
}

function renderCartFab(activeBudget, totals) {
  const itemCount = activeBudget.items.length;
  dom.cartFabBadge.textContent = String(itemCount);
  dom.cartFabBadge.hidden = itemCount === 0;
  if (dom.cartFabTotal) {
    dom.cartFabTotal.textContent = formatCurrency(totals.finalPrice);
  }
  dom.cartFabButton.setAttribute("aria-label", `Abrir fichinha do orçamento com ${formatItemsCounter(itemCount, itemCount)}.`);
}

function pulseCartFab() {
  window.clearTimeout(cartFabPulseTimeoutId);
  dom.cartFabButton.classList.add("is-pulsing");
  cartFabPulseTimeoutId = window.setTimeout(() => {
    dom.cartFabButton.classList.remove("is-pulsing");
  }, CART_FAB_PULSE_MS);
}

function handleReferenceImageChange(event) {
  const imageFile = event.target.files?.[0];

  if (!imageFile || !imageFile.type.startsWith("image/") || imageFile.size > MAX_IMAGE_SIZE_BYTES) {
    event.target.value = "";
    showAppToast("Use uma imagem PNG, JPG ou WEBP com até 8 MB.", "danger");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const activeBudget = getActiveBudget();
    activeBudget.referenceImage = String(reader.result || "");
    activeBudget.referenceImageName = imageFile.name;
    saveAppState();
    renderReferencePreview();
    showAppToast("Imagem de referência adicionada.");
  });
  reader.readAsDataURL(imageFile);
}

function removeReferenceImage() {
  const activeBudget = getActiveBudget();
  activeBudget.referenceImage = "";
  activeBudget.referenceImageName = "";
  dom.referenceImageInput.value = "";
  saveAppState();
  renderReferencePreview();
  showAppToast("Imagem de referência removida.");
}

function createNewBudget() {
  const newBudget = {
    ...DEFAULT_BUDGET,
    id: createId("budget"),
    items: []
  };
  appState.budgets.unshift(newBudget);
  appState.activeBudgetId = newBudget.id;
  saveAppState();
  renderBudget();
  renderDashboard();
  renderHomeStats();
  showAppToast("Novo orçamento criado.");
}

function duplicateActiveBudget() {
  const activeBudget = getActiveBudget();
  const duplicatedBudget = {
    ...activeBudget,
    id: createId("budget"),
    name: `${sanitizeText(activeBudget.name) || DEFAULT_BUDGET.name} - cópia`,
    items: activeBudget.items.map((item) => ({
      ...item,
      id: createId("cart")
    }))
  };
  appState.budgets.unshift(duplicatedBudget);
  appState.activeBudgetId = duplicatedBudget.id;
  saveAppState();
  renderBudget();
  renderDashboard();
  renderHomeStats();
  showAppToast("Orçamento duplicado.");
}

function addItemToBudget(itemId, rawQuantity) {
  const inventoryItem = findInventoryItem(itemId);

  if (!inventoryItem) {
    return;
  }

  const activeBudget = getActiveBudget();
  const quantityUsed = sanitizeUsageQuantity(inventoryItem, rawQuantity, getMinimumQuantity(inventoryItem));
  const existingCartItem = activeBudget.items.find((cartItem) => cartItem.inventoryItemId === itemId);
  let cartItemId = "";

  updateAppStateWithoutFullRender(() => {
    if (existingCartItem) {
      existingCartItem.quantityUsed = sanitizeUsageQuantity(inventoryItem, existingCartItem.quantityUsed + quantityUsed, getMinimumQuantity(inventoryItem));
      cartItemId = existingCartItem.id;
      return;
    }

    const newCartItem = {
      id: createId("cart"),
      inventoryItemId: itemId,
      quantityUsed
    };
    activeBudget.items.push(newCartItem);
    cartItemId = newCartItem.id;
  });

  markBudgetItemAsAdded(itemId, cartItemId);
  renderBudgetTotalsOnly();
  renderStockPicker();
  renderCart();
  renderDashboard();
  renderHomeStats();
  pulseCartFab();
  showAppToast("Item adicionado!");
}

function markBudgetItemAsAdded(inventoryItemId, cartItemId) {
  window.clearTimeout(addFeedbackTimeoutId);
  recentlyAddedInventoryItemId = inventoryItemId;
  recentlyAddedCartItemId = cartItemId;
  addFeedbackTimeoutId = window.setTimeout(() => {
    recentlyAddedInventoryItemId = "";
    recentlyAddedCartItemId = "";
    renderStockPicker();
    renderCart();
  }, 1600);
}

function adjustCartQuantity(cartItemId, action) {
  const activeBudget = getActiveBudget();
  const cartItem = activeBudget.items.find((item) => item.id === cartItemId);
  const inventoryItem = cartItem ? findInventoryItem(cartItem.inventoryItemId) : null;

  if (!cartItem || !inventoryItem) {
    return;
  }

  const nextQuantity = adjustQuantity(inventoryItem, cartItem.quantityUsed, action, 0);

  updateAppStateWithoutFullRender(() => {
    if (nextQuantity <= 0) {
      activeBudget.items = activeBudget.items.filter((item) => item.id !== cartItemId);
      showAppToast("Item removido do orçamento.");
      return;
    }

    cartItem.quantityUsed = nextQuantity;
  });

  renderBudgetTotalsOnly();
  renderCart();
  renderDashboard();
  renderHomeStats();
}

function updateCartQuantity(cartItemId, rawQuantity) {
  const activeBudget = getActiveBudget();
  const cartItem = activeBudget.items.find((item) => item.id === cartItemId);
  const inventoryItem = cartItem ? findInventoryItem(cartItem.inventoryItemId) : null;

  if (!cartItem || !inventoryItem) {
    return;
  }

  const quantityUsed = sanitizeUsageQuantity(inventoryItem, rawQuantity, 0);

  updateAppStateWithoutFullRender(() => {
    if (quantityUsed <= 0) {
      activeBudget.items = activeBudget.items.filter((item) => item.id !== cartItemId);
      showAppToast("Item removido do orçamento.");
      return;
    }

    cartItem.quantityUsed = quantityUsed;
  });

  renderBudgetTotalsOnly();
  renderCart();
  renderDashboard();
  renderHomeStats();
}

function removeCartItem(cartItemId) {
  const activeBudget = getActiveBudget();
  updateAppStateWithoutFullRender(() => {
    activeBudget.items = activeBudget.items.filter((item) => item.id !== cartItemId);
  });
  renderBudgetTotalsOnly();
  renderCart();
  renderDashboard();
  renderHomeStats();
  showAppToast("Item removido do orçamento.");
}

function clearActiveBudgetCart() {
  const activeBudget = getActiveBudget();

  if (activeBudget.items.length === 0) {
    showAppToast("O carrinho já está vazio.");
    renderBudgetTotalsOnly();
    renderCart();
    return;
  }

  updateAppStateWithoutFullRender(() => {
    activeBudget.items = [];
  });
  renderBudgetTotalsOnly();
  renderCart();
  renderDashboard();
  renderHomeStats();
  showAppToast("Carrinho do orçamento limpo.");
}

function adjustQuantity(item, currentValue, action, minimumValue) {
  const rules = getUsageRules(item);
  const signal = action === "decrease" ? -1 : 1;
  const nextValue = normalizeNumber(currentValue) + (rules.step * signal);
  return sanitizeUsageQuantity(item, nextValue, minimumValue);
}

function sanitizeUsageQuantity(item, rawValue, minimumValue) {
  const quantity = normalizeNumber(rawValue);
  const rules = getUsageRules(item);
  const safeQuantity = Math.max(minimumValue, quantity);

  if (rules.integerOnly) {
    return Math.max(minimumValue, Math.round(safeQuantity));
  }

  return roundDecimal(safeQuantity);
}

function getMinimumQuantity(item) {
  return getUsageRules(item).integerOnly ? 1 : DECIMAL_STEP;
}

function getUsageRules(item) {
  const usesDecimal = isDecimalMeasure(item.measureUnit);
  return {
    step: usesDecimal ? DECIMAL_STEP : INTEGER_STEP,
    defaultValue: usesDecimal ? DECIMAL_STEP : INTEGER_STEP,
    inputMode: usesDecimal ? "decimal" : "numeric",
    integerOnly: !usesDecimal
  };
}

function isDecimalMeasure(measureUnit) {
  return [MEASURE_ML, MEASURE_METER].includes(measureUnit);
}

function getActiveBudget() {
  let activeBudget = appState.budgets.find((budget) => budget.id === appState.activeBudgetId);

  if (!activeBudget) {
    activeBudget = appState.budgets[0] || { ...DEFAULT_BUDGET, items: [] };
    appState.activeBudgetId = activeBudget.id;
  }

  return activeBudget;
}

function findInventoryItem(itemId) {
  return appState.inventoryItems.find((item) => item.id === itemId) || null;
}

function getFilteredInventoryItems(searchTerm, categoryFilter) {
  const normalizedSearch = normalizeSearch(searchTerm);
  const normalizedCategory = normalizeCategory(categoryFilter);

  return appState.inventoryItems.filter((item) => {
    const matchesCategory = normalizedCategory === CATEGORY_ALL || item.category === normalizedCategory;
    const matchesSearch = !normalizedSearch || normalizeSearch(getSearchIndex(item)).includes(normalizedSearch);
    return matchesCategory && matchesSearch;
  });
}

function getSearchIndex(item) {
  return [
    item.category,
    item.name,
    item.brand,
    item.color,
    item.measureUnit,
    getItemSpecification(item)
  ].join(" ");
}

function getBusinessCategories() {
  return CATEGORY_ORDER.filter((categoryName) => categoryName !== CATEGORY_ALL);
}

function countItemsByCategory(categoryName) {
  if (categoryName === CATEGORY_ALL) {
    return appState.inventoryItems.length;
  }

  return appState.inventoryItems.filter((item) => item.category === categoryName).length;
}

function calculateUnitCost(item) {
  return calculateUnitCostCore(item, getInventoryCalculationContext());
}

function calculateRawUnitCost(price, quantity) {
  return calculateRawUnitCostCore(price, quantity, normalizeNumber);
}

function calculateTotalInventoryValue(item) {
  return calculateTotalInventoryValueCore(item, normalizeNumber);
}

function calculateLineSubtotal(item, quantityUsed) {
  return calculateLineSubtotalCore(item, quantityUsed, getInventoryCalculationContext());
}

function calculateBudgetTotals(budget) {
  return calculateBudgetTotalsCore(budget, {
    findInventoryItem,
    calculateLineSubtotal,
    normalizeNumber,
    normalizePercent,
    roundMoneyValue
  });
}

function getInventoryCalculationContext() {
  return {
    normalizeNumber,
    purchaseModeSingle: PURCHASE_MODE_SINGLE,
    unitPurchaseCategories: UNIT_PURCHASE_CATEGORIES,
    supportedCategories: [CATEGORY_PRINT_SUPPLIES, CATEGORY_BLANK_PRODUCTS, CATEGORY_FINISHING_PACKAGING]
  };
}

function calculateDashboardMetrics() {
  const categoryInvestmentMap = appState.inventoryItems.reduce((investmentMap, item) => {
    const currentValue = investmentMap.get(item.category) || 0;
    investmentMap.set(item.category, currentValue + calculateTotalInventoryValue(item));
    return investmentMap;
  }, new Map());
  const categoryInvestments = Array.from(categoryInvestmentMap, ([category, totalValue]) => ({
    category,
    totalValue
  }))
    .filter((categoryInvestment) => categoryInvestment.totalValue > 0)
    .sort((firstCategory, secondCategory) => secondCategory.totalValue - firstCategory.totalValue);
  const totalInventoryInvestment = categoryInvestments.reduce((totalValue, categoryInvestment) => totalValue + categoryInvestment.totalValue, 0);

  return {
    totalInventoryInvestment,
    categoryInvestments,
    generatedBudgetCount: countGeneratedBudgets()
  };
}

function countGeneratedBudgets() {
  return appState.budgets.filter(isGeneratedBudget).length;
}

function isGeneratedBudget(budget) {
  const budgetName = sanitizeText(budget.name);
  return Boolean(sanitizeText(budget.clientName))
    || Boolean(budgetName && budgetName !== DEFAULT_BUDGET.name)
    || normalizeNumber(budget.hourlyRate) > 0
    || normalizeNumber(budget.sessionDuration) > 0
    || normalizeNumber(budget.profitMarginValue) > 0
    || normalizeNumber(budget.discountValue) > 0
    || Boolean(sanitizeText(budget.referenceImage))
    || (Array.isArray(budget.items) && budget.items.length > 0);
}

function getItemSpecification(item) {
  if (item.category === CATEGORY_BLANK_PRODUCTS) {
    return "Cálculo por unidade";
  }

  const color = sanitizeText(item.color);
  const measure = `${formatNumber(item.packageQuantity)} ${getMeasureLabel(item.measureUnit)}`;
  return color ? `${color} · ${measure}` : measure;
}

function getItemSubtitle(item) {
  const brand = item.brand || "Fornecedor não informado";
  return `${brand} · ${getItemSpecification(item)}`;
}

function formatStockQuantity(item) {
  const quantity = formatNumber(item.stockQuantity);

  if (item.category === CATEGORY_BLANK_PRODUCTS && item.purchaseMode === PURCHASE_MODE_BOX) {
    return `${quantity} pacote(s)`;
  }

  if (item.category === CATEGORY_PRINT_SUPPLIES || item.category === CATEGORY_FINISHING_PACKAGING) {
    return `${quantity} embalagem(ns)`;
  }

  return `${quantity} unidade(s)`;
}

function getCalculationDescription(item) {
  const stockQuantity = formatNumber(item.stockQuantity);
  const totalValue = formatCurrency(calculateTotalInventoryValue(item));

  if (item.category === CATEGORY_BLANK_PRODUCTS && item.purchaseMode === PURCHASE_MODE_SINGLE) {
    return `${stockQuantity} unidade(s) em estoque. Valor financeiro total: ${totalValue}.`;
  }

  if (item.category === CATEGORY_BLANK_PRODUCTS) {
    return `${stockQuantity} pacote(s)/caixa(s) em estoque. Pacote com ${formatNumber(item.packageQuantity)} unidades.`;
  }

  return `${stockQuantity} embalagem(ns) em estoque. Embalagem com ${formatNumber(item.packageQuantity)} ${getMeasureLabel(item.measureUnit)}.`;
}

function getProductInitial(item) {
  return sanitizeText(item.name).slice(0, 2).toUpperCase() || "LS";
}

function getMeasureLabel(measureUnit) {
  const labels = {
    [MEASURE_UNIT]: "unidade",
    [MEASURE_ML]: "ml",
    [MEASURE_METER]: "m",
    [MEASURE_SHEET]: "folha"
  };
  return labels[measureUnit] || measureUnit || "unidade";
}

function getMeasureSuffix(measureUnit) {
  const suffixes = {
    [MEASURE_UNIT]: "un",
    [MEASURE_ML]: "ml",
    [MEASURE_METER]: "m",
    [MEASURE_SHEET]: "fl"
  };
  return suffixes[measureUnit] || "";
}

function normalizeMeasureUnit(unitValue, fallbackUnit = MEASURE_UNIT) {
  const normalizedValue = sanitizeText(unitValue).toLowerCase();
  const unitMap = {
    unidade: MEASURE_UNIT,
    unidades: MEASURE_UNIT,
    unid: MEASURE_UNIT,
    un: MEASURE_UNIT,
    ml: MEASURE_ML,
    mililitro: MEASURE_ML,
    mililitros: MEASURE_ML,
    metro: MEASURE_METER,
    metros: MEASURE_METER,
    m: MEASURE_METER,
    folha: MEASURE_SHEET,
    folhas: MEASURE_SHEET,
    fl: MEASURE_SHEET
  };
  return unitMap[normalizedValue] || fallbackUnit;
}

function normalizeCategory(categoryValue) {
  const normalizedValue = normalizeSearch(categoryValue);
  const categoryMap = {
    todos: CATEGORY_ALL,
    "insumos de impressao": CATEGORY_PRINT_SUPPLIES,
    "insumo de impressao": CATEGORY_PRINT_SUPPLIES,
    impressao: CATEGORY_PRINT_SUPPLIES,
    tinta: CATEGORY_PRINT_SUPPLIES,
    tintas: CATEGORY_PRINT_SUPPLIES,
    cmyk: CATEGORY_PRINT_SUPPLIES,
    papel: CATEGORY_PRINT_SUPPLIES,
    filme: CATEGORY_PRINT_SUPPLIES,
    dtf: CATEGORY_PRINT_SUPPLIES,
    sublimatico: CATEGORY_PRINT_SUPPLIES,
    "itens para confeccao/lisos": CATEGORY_BLANK_PRODUCTS,
    "itens para confeccao": CATEGORY_BLANK_PRODUCTS,
    "itens lisos": CATEGORY_BLANK_PRODUCTS,
    "pecas lisas": CATEGORY_BLANK_PRODUCTS,
    caneca: CATEGORY_BLANK_PRODUCTS,
    camiseta: CATEGORY_BLANK_PRODUCTS,
    calca: CATEGORY_BLANK_PRODUCTS,
    ecobag: CATEGORY_BLANK_PRODUCTS,
    cueca: CATEGORY_BLANK_PRODUCTS,
    bolsa: CATEGORY_BLANK_PRODUCTS,
    acabamento: CATEGORY_FINISHING_PACKAGING,
    acabamentos: CATEGORY_FINISHING_PACKAGING,
    embalagem: CATEGORY_FINISHING_PACKAGING,
    embalagens: CATEGORY_FINISHING_PACKAGING,
    "acabamento e embalagem": CATEGORY_FINISHING_PACKAGING,
    fita: CATEGORY_FINISHING_PACKAGING,
    cetim: CATEGORY_FINISHING_PACKAGING,
    laco: CATEGORY_FINISHING_PACKAGING,
    presente: CATEGORY_FINISHING_PACKAGING
  };
  return categoryMap[normalizedValue] || CATEGORY_PRINT_SUPPLIES;
}

function normalizeAdjustmentType(value) {
  return sanitizeText(value) === ADJUSTMENT_FIXED ? ADJUSTMENT_FIXED : ADJUSTMENT_PERCENT;
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const compactValue = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  const hasComma = compactValue.includes(",");
  const sanitizedValue = hasComma
    ? compactValue.replace(/\./g, "").replace(",", ".")
    : compactValue;
  const parsedValue = Number.parseFloat(sanitizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function normalizePercent(value) {
  return Math.min(Math.max(normalizeNumber(value), 0), 100);
}

function normalizeSearch(value) {
  return sanitizeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function roundDecimal(value) {
  return Math.round((normalizeNumber(value) + Number.EPSILON) * 100) / 100;
}

function roundMoneyValue(value) {
  return roundDecimal(value);
}

function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(normalizeNumber(value));
}

function formatNumber(value) {
  return NUMBER_FORMATTER.format(normalizeNumber(value));
}

function formatEditableNumber(value) {
  const normalizedValue = normalizeNumber(value);
  return normalizedValue > 0 ? String(roundDecimal(normalizedValue)).replace(".", ",") : "";
}

function formatCounter(currentValue, totalValue) {
  return `${normalizeNumber(currentValue)} de ${normalizeNumber(totalValue)}`;
}

function formatCompactCount(value) {
  return String(normalizeNumber(value));
}

function formatItemsCounter(currentValue, totalValue) {
  const current = normalizeNumber(currentValue);
  const total = normalizeNumber(totalValue);

  if (current === total) {
    return `${total} ${total === 1 ? "item" : "itens"}`;
  }

  return `${current} ${current === 1 ? "item" : "itens"} filtrado${current === 1 ? "" : "s"}`;
}

function createIconHtml(iconName, className = "") {
  return `<i class="inline-icon ${escapeAttribute(className)}" data-lucide="${escapeAttribute(iconName)}" aria-hidden="true"></i>`;
}

function getCategoryIconName(categoryName) {
  return CATEGORY_ICON_MAP[categoryName] || "package";
}

function renderLucideIcons() {
  if (!window.lucide || typeof window.lucide.createIcons !== "function") {
    return;
  }

  window.lucide.createIcons({
    attrs: {
      "stroke-width": 2,
      "aria-hidden": "true"
    }
  });
}

function createEmptyStateHtml(message) {
  return `
    <article class="empty-state">
      <strong>${escapeHtml(message)}</strong>
      <span>Use a busca, altere o filtro ou cadastre um novo item.</span>
    </article>
  `;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return sanitizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function sanitizeFileName(value) {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "orcamento-sublimacao";
}

function isImageDataUrl(value) {
  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(value || ""));
}

async function exportPdf() {
  const activeBudget = getActiveBudget();
  const fileName = `${sanitizeFileName(activeBudget.name || "orcamento-sublimacao")}.pdf`;
  const totals = calculateBudgetTotals(activeBudget);

  try {
    await exportInternalBudgetPdf({
      fileName,
      budgetName: activeBudget.name,
      clientName: activeBudget.clientName,
      referenceImage: activeBudget.referenceImage,
      referenceImageName: activeBudget.referenceImageName,
      items: createInternalPdfItems(activeBudget),
      totals,
      labor: {
        rate: activeBudget.hourlyRate,
        quantity: activeBudget.sessionDuration > 0 ? activeBudget.sessionDuration : 1,
        total: totals.laborCost
      },
      adjustments: {
        profitMarginType: activeBudget.profitMarginType,
        profitMarginValue: activeBudget.profitMarginValue,
        profitMarginAmount: totals.marginCost,
        discountType: activeBudget.discountType,
        discountValue: activeBudget.discountValue,
        discountAmount: totals.discountAmount
      },
      generatedAt: new Date()
    });
    showAppToast("Relatório interno gerado com sucesso.");
  } catch {
    showAppToast("Não foi possível gerar o relatório interno. Verifique a conexão com a biblioteca jsPDF.", "danger");
  }
}

async function exportClientPdf() {
  const activeBudget = getActiveBudget();
  const totals = calculateBudgetTotals(activeBudget);
  const clientPdfItems = createClientPdfItems(activeBudget, totals);

  if (clientPdfItems.length === 0) {
    showAppToast("Adicione uma peça lisa ao orçamento antes de gerar o PDF do cliente.", "danger");
    return;
  }

  try {
    await exportClientBudgetPdf({
      fileName: `${sanitizeFileName(`${activeBudget.name || "orcamento"}-cliente`)}.pdf`,
      budgetName: activeBudget.name,
      clientName: activeBudget.clientName,
      referenceImage: activeBudget.referenceImage,
      referenceImageName: activeBudget.referenceImageName,
      items: clientPdfItems,
      finalPrice: totals.finalPrice,
      generatedAt: new Date()
    });
    showAppToast("PDF para o cliente gerado com sucesso.");
  } catch {
    showAppToast("Não foi possível gerar o PDF do cliente. Verifique a conexão com a biblioteca jsPDF.", "danger");
  }
}

function createInternalPdfItems(budget) {
  return budget.items
    .map((cartItem) => {
      const inventoryItem = findInventoryItem(cartItem.inventoryItemId);

      if (!inventoryItem) {
        return null;
      }

      const quantity = normalizeNumber(cartItem.quantityUsed);

      return {
        name: inventoryItem.name,
        category: inventoryItem.category,
        specification: getItemSpecification(inventoryItem),
        quantity,
        measureLabel: getMeasureLabel(inventoryItem.measureUnit),
        unitCost: calculateUnitCost(inventoryItem),
        subtotal: roundMoneyValue(calculateLineSubtotal(inventoryItem, quantity))
      };
    })
    .filter(Boolean);
}

function createClientPdfItems(budget, totals) {
  const finalProductEntries = budget.items
    .map((cartItem) => ({
      cartItem,
      inventoryItem: findInventoryItem(cartItem.inventoryItemId)
    }))
    .filter(({ inventoryItem, cartItem }) => inventoryItem?.category === CATEGORY_BLANK_PRODUCTS && normalizeNumber(cartItem.quantityUsed) > 0)
    .sort((firstEntry, secondEntry) => normalizeNumber(secondEntry.cartItem.quantityUsed) - normalizeNumber(firstEntry.cartItem.quantityUsed));

  const primaryEntries = finalProductEntries.slice(0, CLIENT_PDF_MAX_ITEMS);

  return primaryEntries.map(({ cartItem, inventoryItem }) => {
    const quantity = normalizeNumber(cartItem.quantityUsed);
    const unitPrice = quantity > 0 ? roundMoneyValue(totals.finalPrice / quantity) : totals.finalPrice;

    return {
      name: getClientProductName(inventoryItem, quantity),
      quantity,
      unitPrice,
      totalPrice: totals.finalPrice
    };
  });
}

function getClientProductName(item, quantity) {
  const normalizedName = normalizeSearch(item.name);
  const isPlural = normalizeNumber(quantity) > 1;

  if (normalizedName.includes("camiseta") || normalizedName.includes("camisa")) {
    return isPlural ? "Camisetas Estampadas" : "Camiseta Estampada";
  }

  if (normalizedName.includes("caneca")) {
    return isPlural ? "Canecas Personalizadas" : "Caneca Personalizada";
  }

  if (normalizedName.includes("calca")) {
    return isPlural ? "Calças Estampadas" : "Calça Estampada";
  }

  if (normalizedName.includes("ecobag") || normalizedName.includes("sacola")) {
    return isPlural ? "Ecobags Personalizadas" : "Ecobag Personalizada";
  }

  if (normalizedName.includes("cueca")) {
    return isPlural ? "Cuecas Personalizadas" : "Cueca Personalizada";
  }

  if (normalizedName.includes("bolsa")) {
    return isPlural ? "Bolsas Personalizadas" : "Bolsa Personalizada";
  }

  const cleanName = sanitizeText(item.name)
    .replace(/\blis[ao]s?\b/gi, "")
    .replace(/\bbranc[ao]s?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return `${cleanName || "Produto"} Personalizado${isPlural ? "s" : ""}`;
}
