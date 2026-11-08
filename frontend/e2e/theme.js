// Phones keep the theme switch in the workspace menu ("More tools and
// account"); larger screens show it in the top bar. Switch from wherever it
// lives, then put the menu away so the page is in view again.
async function switchTheme(page, name) {
  const toggle = page.getByRole("button", { name });
  if (await toggle.isVisible()) {
    await toggle.click();
    return;
  }
  await page
    .getByRole("button", { name: "More tools and account", exact: true })
    .click();
  await toggle.click();
  const close = page.getByRole("button", {
    name: "Close workspace menu",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
}

export const switchToDarkMode = (page) =>
  switchTheme(page, "Switch to dark mode");
export const switchToLightMode = (page) =>
  switchTheme(page, "Switch to light mode");
