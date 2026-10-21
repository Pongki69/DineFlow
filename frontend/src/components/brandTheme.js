const fallback = "#245440";

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

export function brandTheme(value) {
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  let channels = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  // Cover both white primary-button text and accent text on secondary hover surfaces.
  const secondarySurface = luminance([238, 242, 233]);
  while ((secondarySurface + 0.05) / (luminance(channels) + 0.05) < 4.5) {
    channels = channels.map((channel) => Math.floor(channel * 0.94));
  }
  return {
    "--primary": hex(channels),
    "--brand-color": hex(channels),
    "--primary-hover": hex(
      channels.map((channel) => Math.floor(channel * 0.85)),
    ),
  };
}
