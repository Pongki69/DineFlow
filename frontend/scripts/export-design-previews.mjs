import { readdir, mkdir, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const input = path.join(frontend, "test-results", "design-lab");
const output = path.resolve(
  frontend,
  "..",
  "docs",
  "design-system",
  "previews",
);
const roles = {
  landing: "Public landing",
  administrator: "Administrator",
  manager: "Manager",
  cashier: "Cashier",
  kitchen_staff: "Kitchen Staff",
  waiter: "Waiter / Service Staff",
  rider: "Delivery Rider",
  customer: "Customer",
};
const devices = {
  desktop: "1440 × 1000",
  tablet: "834 × 1112",
  mobile: "390 × 844",
};

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(absolute) : [absolute];
    }),
  );
  return nested.flat();
}

const files = await filesIn(input);
const expected = Object.keys(roles).flatMap((role) =>
  Object.keys(devices).map((device) => `${role}-${device}.png`),
);
const sources = expected.map((name) => {
  const matches = files.filter((file) => path.basename(file) === name);
  if (matches.length !== 1)
    throw new Error(
      `Expected one completed screenshot for ${name}; found ${matches.length}. Run the full design browser suite first.`,
    );
  return { name, source: matches[0] };
});
await mkdir(output, { recursive: true });
await Promise.all(
  sources.map(({ name, source }) => copyFile(source, path.join(output, name))),
);

const sections = Object.entries(roles)
  .map(
    ([role, label]) =>
      `<section id="${role}"><h2>${label}</h2><div class="frames">${Object.entries(
        devices,
      )
        .map(
          ([device, dimensions]) =>
            `<figure><a href="${role}-${device}.png"><img src="${role}-${device}.png" alt="${label}: ${device} responsive layout" loading="lazy" width="360" height="420"/><span>${device} · ${dimensions}</span></a><figcaption>Actual browser capture; open for the full layout.</figcaption></figure>`,
        )
        .join("")}</div></section>`,
  )
  .join("\n");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>DineFlow · Responsive layout library</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f9f5;color:#1a2421;font:16px/1.5 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:32px}h1{font-size:clamp(28px,4vw,48px);line-height:1.2;letter-spacing:-.03em}h2{font-size:25px;margin-top:48px}p,figcaption{color:#3f5147}nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}nav a{display:inline-flex;align-items:center;min-height:48px;padding:12px 16px;background:#fff;border:1px solid #768573;border-radius:8px;color:#1e4d3a;text-decoration:none}.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}figure{margin:0;background:#fff;border:1px solid #d8e2d1;border-radius:16px;overflow:hidden}figure a{display:block;color:#1e4d3a;font-weight:600}figure img{width:100%;height:420px;object-fit:cover;object-position:top;display:block;border-bottom:1px solid #d8e2d1}figure span{display:block;min-height:48px;padding:16px}figcaption{font-size:12.8px;padding:0 16px 16px}a:focus-visible{outline:3px solid #1e4d3a;outline-offset:4px}.note{padding:24px;background:#e8efe0;border-radius:12px;max-width:80ch}@media(max-width:767px){main{padding:16px}.frames{grid-template-columns:1fr}figure img{height:360px}}
</style></head><body><main><p>DineFlow / Sage Organic Minimalism</p><h1>Eight experiences.<br/>One consistent foundation.</h1><p>Public landing and seven role-based dashboards at desktop, tablet and mobile sizes.</p><div class="note">These high-fidelity layouts use the supplied USD fixtures. Financial actions, GPS, staff order entry and shift reconciliation are explicitly local design previews. The audited production app retains its permissions, PHP currency and existing policies.</div><nav aria-label="Layout templates">${Object.entries(
  roles,
)
  .map(([role, label]) => `<a href="#${role}">${label}</a>`)
  .join(
    "",
  )}</nav>${sections}<footer><p>Interactive source: frontend/design-lab.html · Specifications: docs/RESPONSIVE_LAYOUTS.md · Evidence: docs/DESIGN_SYSTEM_AUDIT.md</p></footer></main></body></html>`;
await writeFile(path.join(output, "index.html"), html, "utf8");
console.log(
  `Exported ${sources.length} responsive previews to docs/design-system/previews.`,
);
