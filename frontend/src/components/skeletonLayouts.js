// Admin desktop: the placeholder shown while a page's code is loading.
const LAYOUTS = [
  [/^\/(admin\/)?dashboard|^\/reports/, { stats: 4, body: "charts" }],
  [/^\/admin\/tracking/, { body: "split" }],
  [
    /^\/admin\/(outlets|system-settings|business-settings|settings|payment-settings|delivery)$/,
    { body: "form", rows: 3 },
  ],
  [/^\/admin\/menu/, { body: "cards", rows: 6, columns: 3 }],
  [/^\/admin\/floor-plan/, { body: "plan" }],
  [/^\/kitchen/, { body: "board", columns: 3 }],
  [/^\/cashier\/summary/, { stats: 3, body: "list", rows: 8, rail: true }],
  [/^\/(admin\/audit|activity|reservations)/, { body: "list", rows: 8 }],
  [/^\/admin\/users/, { body: "table", rows: 8, toolbar: true }],
  [/^\/payments\/\d+\/receipt/, { body: "receipt" }],
];

export function routeSkeletonLayout(path) {
  return (
    LAYOUTS.find(([pattern]) => pattern.test(path))?.[1] || {
      body: "table",
      rows: 8,
    }
  );
}
