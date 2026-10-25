export function DishPortion({ item }) {
  const details = [
    item.pieces != null &&
      `${item.pieces} ${Number(item.pieces) === 1 ? "pc" : "pcs"}`,
    item.servings != null &&
      `${item.servings} ${Number(item.servings) === 1 ? "serving" : "servings"}`,
  ].filter(Boolean);
  return details.length ? (
    <p className="dish-portion">{details.join(" · ")}</p>
  ) : null;
}
