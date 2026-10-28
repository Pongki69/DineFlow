import { visibleNavigation } from "../navigation";

/** Only return to a same-origin route the signed-in account can use.
 * Record-level ownership remains enforced by the existing API.
 * @param {{roles:string[],permissions:string[]}} user
 * @param {string} requested
 * @param {string} origin
 */
export function signInDestination(user, requested, origin) {
  let target;
  try {
    target = new URL(requested, origin);
  } catch {
    return "/";
  }
  if (target.origin !== origin) return "/";
  const visible = visibleNavigation(user.permissions, user.roles).some(
    ([, , path]) => path === target.pathname,
  );
  const personal =
    ["/account", "/payment-return"].includes(target.pathname) ||
    /^\/(delivery\/\d+\/tracking|payments\/\d+\/receipt|riders\/\d+)\/?$/.test(
      target.pathname,
    );
  const rider =
    user.roles.includes("rider") &&
    user.permissions.includes("deliveries.assigned") &&
    /^\/rider\/deliveries\/\d+\/?$/.test(target.pathname);
  return visible || personal || rider
    ? `${target.pathname}${target.search}${target.hash}`
    : "/";
}
