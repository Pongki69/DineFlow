const storageKey = (userId) => `dineflow:cart:v1:${userId}`;
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

// Saved browser data is optional and may be damaged or from an older version.
function validLine(line) {
  return (
    line &&
    typeof line.key === "string" &&
    positiveInteger(line.menu_item_id) &&
    positiveInteger(line.quantity) &&
    (line.variant_id === null || positiveInteger(Number(line.variant_id))) &&
    Array.isArray(line.addon_ids) &&
    line.addon_ids.every(positiveInteger) &&
    typeof line.special_instructions === "string" &&
    line.item?.id === line.menu_item_id &&
    typeof line.item.name === "string" &&
    Number.isFinite(Number(line.item.base_price)) &&
    (line.item.variants == null ||
      (Array.isArray(line.item.variants) &&
        line.item.variants.every(
          (option) =>
            option &&
            positiveInteger(option.id) &&
            Number.isFinite(Number(option.price_adjustment)),
        ))) &&
    (line.item.addons == null ||
      (Array.isArray(line.item.addons) &&
        line.item.addons.every(
          (option) =>
            option &&
            positiveInteger(option.id) &&
            Number.isFinite(Number(option.price)),
        )))
  );
}

export function readSavedCart(userId) {
  if (userId == null) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(userId)));
    if (saved?.version !== 1 || !Array.isArray(saved.lines)) return [];
    return saved.lines.filter(validLine);
  } catch {
    return [];
  }
}

export function saveCart(userId, lines) {
  if (userId == null) return;
  try {
    if (lines.length) {
      localStorage.setItem(
        storageKey(userId),
        JSON.stringify({ version: 1, lines }),
      );
    } else {
      localStorage.removeItem(storageKey(userId));
    }
  } catch {
    // Browsers can disable storage; ordering should still work in memory.
  }
}
