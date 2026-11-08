const fallback = "#1e4d3a";

function luminance(channels) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function hex(channels) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The brand colour as the admin workspace shows it: the colour picked,
 * darkened only as far as readable text on it and from it needs (4.5:1).
 */
export function readableBrand(value) {
  return darkenedAgainst(value, luminance([232, 239, 224]));
}

/** Darkens the colour only as far as 4.5:1 against the given luminance. */
function darkenedAgainst(value, background) {
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  let channels = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  while ((background + 0.05) / (luminance(channels) + 0.05) < 4.5) {
    channels = channels.map((channel) => Math.floor(channel * 0.96));
  }
  return hex(channels);
}

function parsed(value) {
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
}

/** Lightens the colour only as far as 5:1 against a dark background. */
function lightenedAgainst(value, background) {
  let channels = parsed(value);
  while ((luminance(channels) + 0.05) / (background + 0.05) < 5) {
    channels = channels.map((channel) =>
      Math.min(255, Math.ceil(channel + (255 - channel) * 0.06)),
    );
  }
  return hex(channels);
}

/**
 * A 60/30/10 palette from one colour, as CSS variables for the admin and the
 * signed-out pages:
 * 60 - the page and its cards, barely tinted with the brand's hue;
 * 30 - sidebar, top bar, side panels, table headers, dropdown fills, a
 *      clear tint of the brand;
 * 10 - the brand itself on buttons, active items, links and focus.
 * Neutrals are fixed per theme, so text contrast holds for any colour.
 * Dark mode keeps the picked colour on solid fills, and uses a lightened
 * copy wherever the brand is text on a dark surface.
 */
export function adminBrandTheme(value, theme = "light") {
  const dark = theme === "dark";
  const fill = darkenedAgainst(value, 1);
  const tint = dark ? fill : readableBrand(value);
  const mix = (percent, base) =>
    `color-mix(in srgb, ${tint} ${percent}%, ${base})`;
  const softBackground = parsed(fill).map((channel, index) =>
    Math.round(channel * 0.3 + [28, 30, 33][index] * 0.7),
  );
  const accent = dark
    ? lightenedAgainst(value, luminance(softBackground))
    : tint;
  const hover = hex(parsed(tint).map((channel) => Math.floor(channel * 0.85)));
  const canvas = dark ? mix(7, "#111315") : mix(5, "#f7f8f7");
  const border = dark ? mix(26, "#363a3f") : mix(16, "#e4e7e5");
  const control = dark ? mix(42, "#80868c") : mix(38, "#7f8a85");
  const secondary = dark ? mix(24, "#17191c") : mix(16, "#ffffff");
  const soft = mix(dark ? 30 : 14, "var(--surface)");
  return {
    // 60: backgrounds.
    "--canvas": canvas,
    "--df-color-canvas": canvas,
    ...(dark && {
      "--surface": mix(8, "#1a1c1f"),
      "--df-color-surface": mix(8, "#1a1c1f"),
      "--admin-disabled-bg": mix(12, "#26292d"),
      "--admin-disabled-text": mix(14, "#c6cbd0"),
      "--ink": mix(3, "#f1f3f5"),
      "--df-color-ink": mix(3, "#f1f3f5"),
      "--muted": mix(10, "#c3c8cd"),
    }),
    // 30: the second colour.
    "--admin-secondary": secondary,
    ...(dark && { "--admin-sidebar": secondary }),
    "--admin-subtle": dark ? mix(12, "#212428") : mix(7, "#fcfcfc"),
    "--neutral-soft": dark ? mix(15, "#26292d") : mix(9, "#f5f6f5"),
    "--border": border,
    "--control-border": control,
    "--df-color-border": border,
    "--df-color-control-border": control,
    "--primary-soft": soft,
    "--df-color-brand-panel": soft,
    "--df-color-panel": dark ? mix(12, "#212428") : mix(6, "#f6f7f6"),
    "--df-color-secondary": dark ? mix(10, "#c8cdd2") : mix(14, "#3a4440"),
    "--df-color-disabled-bg": dark ? mix(12, "#26292d") : mix(8, "#eef0ee"),
    "--df-color-disabled-text": dark ? mix(14, "#c6cbd0") : mix(15, "#4a5450"),
    "--df-color-selection": mix(dark ? 42 : 22, "var(--surface)"),
    "--df-color-selection-text": dark ? "#f4f5f7" : "#17211e",
    "--primary-border": mix(dark ? 48 : 32, "var(--surface)"),
    // 10: the accent. Solid fills only need white text to read, so they stay
    // closest to the colour picked.
    "--primary": accent,
    "--primary-fill": fill,
    "--primary-hover": hover,
    "--df-color-brand": accent,
    "--df-color-brand-hover": dark ? accent : hover,
    "--df-color-on-brand": "#ffffff",
    "--df-color-focus": accent,
    "--brand-color": dark ? fill : accent,
  };
}

export function brandTheme(value) {
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  let channels = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  // Keep customized brand text readable on the Sage panel as well as white.
  const secondarySurface = luminance([232, 239, 224]);
  while ((secondarySurface + 0.05) / (luminance(channels) + 0.05) < 7) {
    channels = channels.map((channel) => Math.floor(channel * 0.94));
  }
  return {
    "--primary": hex(channels),
    "--df-color-brand": hex(channels),
    "--brand-color": hex(channels),
    "--primary-hover": hex(
      channels.map((channel) => Math.floor(channel * 0.85)),
    ),
    "--df-color-brand-hover": hex(
      channels.map((channel) => Math.floor(channel * 0.85)),
    ),
  };
}
