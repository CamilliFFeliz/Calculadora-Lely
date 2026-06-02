export function readStorageItem(storageKey) {
  try {
    return localStorage.getItem(storageKey) || "";
  } catch {
    return "";
  }
}

export function writeStorageItem(storageKey, value) {
  try {
    localStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageItem(storageKey) {
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export function toPlainData(value) {
  return JSON.parse(JSON.stringify(value));
}
