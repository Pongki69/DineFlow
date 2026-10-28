// @ts-check
/**
 * Reproducible WCAG contrast checks for the approved opaque token pairs.
 * Usage: node scripts/check-design-tokens.mjs [--check]
 * Default writes the evidence artifact. --check also requires it to be current.
 * This does not evaluate DOM contrast, transparency, focus occlusion, or AAA
 * conformance across every success criterion; use the browser and manual audit.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/** @typedef {{label: string, foreground: string, background: string, minimum: number, kind: 'text' | 'ui'}} Pair */
/** @typedef {{label: string, foreground: string, background: string, ratio: number, minimum: number, kind: 'text' | 'ui', passed: boolean}} Result */

const tokenUrl = new URL("../src/design-tokens.css", import.meta.url);
const artifactUrl = new URL(
  "../../docs/design-token-contrast.json",
  import.meta.url,
);
const css = await readFile(tokenUrl, "utf8");

/** @param {string} input @returns {Record<string, string>} */
function declarations(input) {
  return Object.fromEntries(
    [...input.matchAll(/(--df-[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

const firstBlockStart = css.indexOf("{", css.indexOf(".df-theme,"));
const firstBlockEnd = css.indexOf("\n}", firstBlockStart);
const darkSelector = css.indexOf('.df-theme[data-df-theme="dark"]');
const darkBlockStart = css.indexOf("{", darkSelector);
const darkBlockEnd = css.indexOf("\n}", darkBlockStart);
if (
  [
    firstBlockStart,
    firstBlockEnd,
    darkSelector,
    darkBlockStart,
    darkBlockEnd,
  ].some((index) => index < 0)
) {
  throw new Error("The light/dark token blocks could not be parsed.");
}
const light = declarations(css.slice(firstBlockStart, firstBlockEnd));
const dark = {
  ...light,
  ...declarations(css.slice(darkBlockStart, darkBlockEnd)),
};

/** @param {string} name @param {Record<string, string>} tokens @param {Set<string>} [seen] @returns {string} */
function resolveColor(name, tokens, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular variable reference: ${name}`);
  seen.add(name);
  const value = tokens[name];
  if (!value) throw new Error(`Missing color token: ${name}`);
  const alias = /^var\((--df-[\w-]+)\)$/.exec(value);
  if (alias) return resolveColor(alias[1], tokens, seen);
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(
      `Contrast requires an opaque six-digit hex color: ${name} = ${value}`,
    );
  }
  return value.toUpperCase();
}

/** WCAG sRGB relative luminance. @param {string} hex @returns {number} */
function luminance(hex) {
  const values = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

/** @param {string} first @param {string} second @returns {number} */
function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** @type {Pair[]} */
const pairs = [];
const surfaces = ["canvas", "surface", "panel", "brand-panel"];
for (const foreground of ["ink", "secondary", "brand"]) {
  for (const background of surfaces) {
    pairs.push({
      label: `${foreground} on ${background}`,
      foreground: `--df-color-${foreground}`,
      background: `--df-color-${background}`,
      minimum: 7,
      kind: "text",
    });
  }
}
for (const background of ["brand", "brand-hover", "brand-active"]) {
  pairs.push({
    label: `button label on ${background}`,
    foreground: "--df-color-on-brand",
    background: `--df-color-${background}`,
    minimum: 7,
    kind: "text",
  });
}
for (const status of ["pending", "progress", "success", "danger", "neutral"]) {
  pairs.push({
    label: `${status} badge`,
    foreground: `--df-status-${status}-text`,
    background: `--df-status-${status}-bg`,
    minimum: 7,
    kind: "text",
  });
}
pairs.push(
  {
    label: "disabled control label",
    foreground: "--df-color-disabled-text",
    background: "--df-color-disabled-bg",
    minimum: 7,
    kind: "text",
  },
  {
    label: "selected text",
    foreground: "--df-color-selection-text",
    background: "--df-color-selection",
    minimum: 7,
    kind: "text",
  },
);
for (const background of surfaces) {
  pairs.push(
    {
      label: `input boundary on ${background}`,
      foreground: "--df-color-control-border",
      background: `--df-color-${background}`,
      minimum: 3,
      kind: "ui",
    },
    {
      label: `focus indicator on ${background}`,
      foreground: "--df-color-focus",
      background: `--df-color-${background}`,
      minimum: 3,
      kind: "ui",
    },
  );
}

/** @param {Record<string, string>} tokens @returns {Result[]} */
function checkTheme(tokens) {
  return pairs.map((pair) => {
    const foreground = resolveColor(pair.foreground, tokens);
    const background = resolveColor(pair.background, tokens);
    const measured = contrast(foreground, background);
    return {
      label: pair.label,
      foreground,
      background,
      ratio: Number(measured.toFixed(4)),
      minimum: pair.minimum,
      kind: pair.kind,
      passed: measured >= pair.minimum,
    };
  });
}

const results = { light: checkTheme(light), dark: checkTheme(dark) };
const failures = Object.entries(results).flatMap(([theme, checks]) =>
  checks.filter((check) => !check.passed).map((check) => ({ theme, ...check })),
);
const rawRequestedComparisons = [
  ["requested secondary", "--df-palette-muted-forest"],
  ["requested pending accent", "--df-palette-amber"],
  ["requested progress accent", "--df-palette-teal"],
  ["requested danger accent", "--df-palette-terracotta"],
  ["requested olive accent", "--df-palette-olive"],
].map(([label, token]) => {
  const foreground = resolveColor(token, light);
  const background = resolveColor("--df-color-surface", light);
  const measured = contrast(foreground, background);
  return {
    label,
    foreground,
    background,
    ratio: Number(measured.toFixed(4)),
    passesNormalTextAAA: measured >= 7,
  };
});
const artifact = {
  schemaVersion: 1,
  source: "frontend/src/design-tokens.css",
  sourceSha256: createHash("sha256").update(css).digest("hex"),
  method:
    "WCAG relative luminance; sRGB transfer threshold 0.04045; unrounded ratios determine pass/fail",
  scope:
    "Approved opaque token pairs only. Text target 7:1; meaningful UI boundaries/focus target 3:1. This is not a WCAG AAA conformance claim.",
  checksPerTheme: pairs.length,
  passed: failures.length === 0,
  results,
  rawRequestedComparisons,
};
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      { message: "Design token contrast failed", failures },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else if (process.argv.includes("--check")) {
  const saved = await readFile(artifactUrl, "utf8");
  if (saved !== serialized) {
    console.error(
      "Contrast evidence is stale. Run node scripts/check-design-tokens.mjs to regenerate it.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Passed ${pairs.length * 2} contrast checks; evidence is current.`,
    );
  }
} else {
  await writeFile(artifactUrl, serialized, "utf8");
  console.log(
    `Passed ${pairs.length * 2} contrast checks. Evidence: ${fileURLToPath(artifactUrl)}`,
  );
}
