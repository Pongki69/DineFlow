import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Bike,
  CalendarDays,
  ChartNoAxesCombined,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Sun,
  Table2,
  UsersRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { api } from "../api";
import { visibleNavigation, navigationContext } from "../navigation";
import { adminBrandTheme } from "./brandTheme";
import { subscribeToLiveChanges } from "../liveUpdates";
import { adminModuleForPath, adminNavigation } from "./adminNavigation";
import { Notifications } from "./Notifications";
import { useMediaQuery } from "./useMediaQuery";
import { AdminDesktopContext } from "./adminDesk";
import { RiderPullToRefresh } from "./RiderMobileChrome";
import "./adminMobile.css";
import { useWorkspaceTheme } from "./useWorkspaceTheme";
import {
  MobileWorkspaceChrome,
  MobileWorkspaceTitle,
} from "./MobileWorkspaceChrome";
import { mobileWorkspaceTitle } from "./mobileWorkspaceNavigation";
import "../features/adminWorkspace.css";
import "./adminNavigation.css";

const moduleIcons = {
  dashboard: LayoutDashboard,
  tracking: MapPinned,
  outlets: Store,
  orders: ShoppingBag,
  riders: Bike,
  settings: Settings2,
};
const toolIcons = {
  "/reserve": CalendarDays,
  "/my-reservations": CalendarDays,
  "/reservations": CalendarDays,
  "/admin/floor-plan": Table2,
  "/admin/menu": UtensilsCrossed,
  "/kitchen": ChefHat,
  "/service": Table2,
  "/payments": CreditCard,
  "/cashier/summary": CreditCard,
  "/reports": ChartNoAxesCombined,
  "/admin/users": UsersRound,
  "/admin/audit": ShieldCheck,
};
const detailTitles = {
  "/dashboard": "Restaurant overview",
  "/admin/deliveries": "Dispatch queue",
  "/admin/delivery": "Delivery settings",
  "/admin/payment-settings": "Payment settings",
  "/admin/settings": "Reservation settings",
};
// Desktop pages carry the name of their sidebar area above the title.
const moduleContexts = {
  dashboard: "Dashboard",
  tracking: "Delivery operations",
  outlets: "Restaurant setup",
  orders: "Order management",
  settings: "System settings",
};
const desktopSections = [
  {
    key: "service",
    label: "Service & menu",
    paths: [
      "/reserve",
      "/my-reservations",
      "/reservations",
      "/admin/floor-plan",
      "/admin/menu",
      "/kitchen",
      "/service",
    ],
  },
  {
    key: "finance",
    label: "Payments & reports",
    paths: ["/payments", "/cashier/summary", "/reports"],
  },
  {
    key: "people",
    label: "People & records",
    paths: ["/admin/users", "/admin/customers", "/admin/audit", "/activity"],
  },
];
// Lists and forms stop at a readable width on wide screens; boards, maps,
// the dashboards, the menu grid and the floor plan keep the full width.
const readingPages = new Set([
  "/admin/orders",
  "/orders",
  "/admin/deliveries",
  "/admin/outlets",
  "/my-reservations",
  "/reservations",
  "/payments",
  "/cashier/summary",
  "/admin/users",
  "/admin/customers",
  "/admin/audit",
  "/activity",
  "/settings",
  "/account",
  "/admin/system-settings",
  "/admin/business-settings",
  "/admin/settings",
  "/admin/payment-settings",
  "/admin/delivery",
]);
const searchable = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

export function AdminShell({ user, onSignOut, children }) {
  const [collapsed, setCollapsed] = useState(false);
  // Phones get the app layout the rider workspace uses: alerts in the bottom
  // bar, pull to refresh, and a centred title in a slim top bar.
  const compactScreen = useMediaQuery("(max-width: 850px)");
  const desktopScreen = useMediaQuery("(min-width: 1024px)");
  const desktopAdmin = desktopScreen && user.roles.includes("administrator");
  const [desktopSection, setDesktopSection] = useState(null);
  const { theme, setTheme } = useWorkspaceTheme();
  const [branding, setBranding] = useState("DineFlow");
  const [brandColor, setBrandColor] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsQuery, setToolsQuery] = useState("");
  const mobile = useRef(null);
  const profile = useRef(null);
  const menuButton = useRef(null);
  const profileButton = useRef(null);
  const toolsDialog = useRef(null);
  const toolsSearch = useRef(null);
  const toolsButton = useRef(null);
  const restoreToolsFocus = useRef(true);
  const main = useRef(null);
  const sidebar = useRef(null);
  const location = useLocation();
  const links = visibleNavigation(user.permissions, user.roles);
  const { primary, tools } = adminNavigation(links);
  const currentModule = adminModuleForPath(location.pathname, primary);
  const searchWords = searchable(toolsQuery).trim().split(/\s+/);
  const visibleTools = tools.filter(([label]) =>
    searchWords.every((word) => searchable(label).includes(word)),
  );
  const pageSection = desktopSections.find((section) =>
    section.paths.includes(location.pathname),
  );
  const activeDesktopSection = pageSection?.key;
  // The desktop sidebar groups already list every tool, so "More tools" would
  // repeat them. It stays for phones, managers and a collapsed sidebar.
  const toolsInSidebar =
    desktopAdmin &&
    !collapsed &&
    tools.every(([, , path]) =>
      desktopSections.some((section) => section.paths.includes(path)),
    );
  const current =
    detailTitles[location.pathname] ||
    currentModule?.label ||
    navigationContext(location.pathname, links).title;
  const breadcrumbParent = detailTitles[location.pathname]
    ? currentModule
    : null;
  const pageContext =
    pageSection?.label ||
    moduleContexts[currentModule?.key] ||
    (["/settings", "/account"].includes(location.pathname)
      ? "Your account"
      : location.pathname.startsWith("/payments/")
        ? "Payments & reports"
        : /^\/(riders|delivery)\//.test(location.pathname)
          ? "Delivery operations"
          : null);
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      api("/restaurant/branding", { signal: controller.signal })
        .then((result) => {
          setBranding(result.data?.name || "DineFlow");
          setBrandColor(result.data?.brand_color || "");
        })
        .catch(() => {});
    load();
    // Saved in System settings, here or on another screen: apply it now.
    const unsubscribe = subscribeToLiveChanges(load, ["settings"]);
    window.addEventListener("dineflow:branding-changed", load);
    // Another open tab may have saved a new colour while this one sat idle.
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      unsubscribe();
      window.removeEventListener("dineflow:branding-changed", load);
      window.removeEventListener("focus", load);
    };
  }, []);
  // The restaurant's colour across the workspace, including panels that
  // render outside the shell.
  useEffect(() => {
    if (!/^#[0-9a-f]{6}$/i.test(brandColor)) return undefined;
    const vars = Object.entries(adminBrandTheme(brandColor, theme));
    const targets = [
      ...document.querySelectorAll(".dineflow-app, .admin-shell"),
    ];
    targets.forEach((element) =>
      vars.forEach(([name, value]) => element.style.setProperty(name, value)),
    );
    return () =>
      targets.forEach((element) =>
        vars.forEach(([name]) => element.style.removeProperty(name)),
      );
  }, [brandColor, theme]);
  useEffect(() => {
    document.title = `${current} · ${branding}`;
  }, [current, branding]);
  // Desktop: keep the current page visible in the sidebar, clear of the
  // profile footer, when a long group pushes it below the fold.
  useEffect(() => {
    if (!desktopScreen) return undefined;
    const reveal = () =>
      sidebar.current
        ?.querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    // Follow the list while it settles: a group opening, or the outlet name
    // arriving, moves the link after the first pass.
    const frame = requestAnimationFrame(reveal);
    const resized =
      typeof ResizeObserver === "function" ? new ResizeObserver(reveal) : null;
    const watch = () => {
      for (const child of sidebar.current?.children || [])
        resized?.observe(child);
    };
    const added = new MutationObserver(() => {
      watch();
      reveal();
    });
    watch();
    if (sidebar.current) added.observe(sidebar.current, { childList: true });
    const stop = () => {
      resized?.disconnect();
      added.disconnect();
    };
    const settle = window.setTimeout(stop, 1500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      stop();
    };
  }, [location.pathname, desktopScreen]);
  useEffect(() => {
    setDesktopSection(null);
    main.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    const focusTitle = () => {
      const heading = main.current?.querySelector("h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        return true;
      }
      return false;
    };
    const observer = new MutationObserver(() => {
      if (focusTitle()) observer.disconnect();
    });
    if (!focusTitle() && main.current)
      observer.observe(main.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);
  function closeMobile() {
    mobile.current?.close();
    setMobileOpen(false);
  }
  function closeTools() {
    toolsDialog.current?.close();
    setToolsOpen(false);
  }
  function openTools(event) {
    toolsButton.current = event.currentTarget;
    restoreToolsFocus.current = true;
    closeMobile();
    setToolsQuery("");
    toolsDialog.current?.showModal();
    setToolsOpen(true);
    toolsSearch.current?.focus();
  }
  function navigation(includeSections = false) {
    return (
      <>
        <Link
          to="/"
          className="admin-brand"
          onClick={closeMobile}
          aria-label={`${branding} home`}
        >
          <span className="admin-brand-icon">
            <UtensilsCrossed size={21} aria-hidden="true" />
          </span>
          <span className="admin-nav-copy">
            <strong>
              DineFlow
              <em>.</em>
            </strong>
            <small>
              {user.roles.includes("administrator")
                ? "RESTAURANT ADMIN"
                : "RESTAURANT OPERATIONS"}
            </small>
          </span>
        </Link>
        {branding?.trim() && !/^dineflow\.?$/i.test(branding.trim()) && (
          <div className="admin-workspace-tag admin-nav-copy">
            <Store size={15} aria-hidden="true" />
            <span className="admin-workspace-name" title={branding}>
              {branding === "DineFlow" ? "Restaurant operations" : branding}
            </span>
          </div>
        )}
        <nav
          aria-label="Main navigation"
          className="admin-navigation admin-navigation--flat"
        >
          {primary.map(({ key, label, path }) => {
            const Icon = moduleIcons[key];
            const active = currentModule?.key === key;
            return (
              <Link
                key={path}
                to={path}
                className={active ? "active" : undefined}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                onClick={closeMobile}
              >
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                <span className="admin-nav-copy">{label}</span>
              </Link>
            );
          })}
          {tools.length > 0 && !(includeSections && toolsInSidebar) && (
            <button
              type="button"
              className={`admin-tools-trigger${tools.some(([, , path]) => path === location.pathname) ? " is-current" : ""}`}
              aria-label="More restaurant tools"
              aria-haspopup="dialog"
              aria-controls="admin-restaurant-tools"
              aria-expanded={toolsOpen}
              title={collapsed ? "More restaurant tools" : undefined}
              onClick={openTools}
            >
              <Grid2X2 size={19} strokeWidth={1.7} aria-hidden="true" />
              <span className="admin-nav-copy">More tools</span>
            </button>
          )}
        </nav>
        {desktopAdmin && includeSections && (
          <nav className="admin-desktop-sections" aria-label="Workspace tools">
            {desktopSections.map((section) => {
              const destinations = tools.filter(([, , path]) =>
                section.paths.includes(path),
              );
              if (!destinations.length) return null;
              const open =
                (desktopSection ?? activeDesktopSection) === section.key;
              return (
                <div className="admin-desktop-section" key={section.key}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`admin-section-${section.key}`}
                    onClick={() => setDesktopSection(open ? "" : section.key)}
                  >
                    <span>{section.label}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <div id={`admin-section-${section.key}`} hidden={!open}>
                    {destinations.map(([label, , path]) => {
                      const Icon = toolIcons[path] || UsersRound;
                      return (
                        <Link
                          key={path}
                          to={path}
                          aria-current={
                            location.pathname === path ? "page" : undefined
                          }
                          onClick={() => setDesktopSection(section.key)}
                        >
                          <Icon
                            size={18}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        )}
        <div className="admin-sidebar-bottom">
          <button
            type="button"
            className="admin-profile-trigger"
            onClick={() => {
              closeMobile();
              profile.current?.showModal();
            }}
            aria-label="Open user profile"
          >
            <span className="admin-avatar">{initials}</span>
            <span className="admin-nav-copy">
              <strong>{user.name}</strong>
              <small>
                {user.roles.includes("administrator")
                  ? "Administrator"
                  : "Restaurant manager"}
              </small>
            </span>
            <ChevronDown
              className="admin-nav-copy"
              size={16}
              aria-hidden="true"
            />
          </button>
        </div>
      </>
    );
  }
  return (
    <div
      className={`admin-shell df-theme${collapsed ? " admin-shell--collapsed" : ""}`}
      data-theme={theme}
      data-df-theme={theme}
      data-role={
        user.roles.includes("administrator") ? "administrator" : "manager"
      }
      data-workspace="admin"
      data-motion={user.preferences?.reduced_motion ? "reduced" : "system"}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="admin-sidebar" ref={sidebar}>
        {navigation(true)}
      </aside>
      <dialog
        className="admin-mobile-dialog"
        ref={mobile}
        aria-label="Navigation"
        onClose={() => {
          setMobileOpen(false);
          menuButton.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMobile();
        }}
      >
        <button
          className="admin-icon-button admin-mobile-close"
          aria-label="Close navigation"
          onClick={closeMobile}
        >
          <X size={20} />
        </button>
        {navigation()}
      </dialog>
      <div className="admin-body">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <MobileWorkspaceTitle
              title={mobileWorkspaceTitle(location.pathname, current)}
              parent={breadcrumbParent}
            />
            <button
              className="admin-icon-button admin-desktop-toggle"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>
            <button
              className="admin-icon-button admin-mobile-toggle"
              ref={menuButton}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => {
                mobile.current?.showModal();
                setMobileOpen(true);
              }}
            >
              <Menu size={21} />
            </button>
            <nav className="admin-breadcrumb" aria-label="Breadcrumb">
              {breadcrumbParent && (
                <>
                  <Link to={breadcrumbParent.path}>
                    {breadcrumbParent.label}
                  </Link>
                  <ChevronRight size={13} aria-hidden="true" />
                </>
              )}
              <strong aria-current="page">{current}</strong>
            </nav>
          </div>
          <div className="admin-topbar-right">
            {desktopScreen ? (
              <div id="admin-live-updates-slot" />
            ) : (
              <span className="admin-topbar-status">
                {user.roles.includes("administrator")
                  ? "Restaurant admin"
                  : "Restaurant manager"}
              </span>
            )}
            <button
              className="admin-icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            {!compactScreen && (
              <Notifications
                user={user}
                showBadge={user.preferences?.show_notification_badge !== false}
              />
            )}
            <button
              className="admin-avatar admin-avatar-button"
              ref={profileButton}
              aria-label="Your account"
              onClick={() => profile.current?.showModal()}
            >
              {initials}
            </button>
          </div>
        </header>
        <main
          ref={main}
          id="main-content"
          className="admin-content"
          tabIndex={-1}
          data-page-width={
            desktopScreen && readingPages.has(location.pathname)
              ? "reading"
              : undefined
          }
        >
          {desktopScreen && pageContext && (
            <p className="admin-page-context">{pageContext}</p>
          )}
          <AdminDesktopContext.Provider value={desktopScreen}>
            {children}
          </AdminDesktopContext.Provider>
        </main>
        <footer className="admin-footer">
          <span>© {new Date().getFullYear()} DineFlow</span>
          <span>Good food. Smooth operations.</span>
          <Link to="/account">
            Account & security <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </footer>
      </div>
      <dialog
        id="admin-restaurant-tools"
        className="admin-tools-dialog"
        ref={toolsDialog}
        aria-labelledby="admin-tools-title"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeTools();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeTools();
        }}
        onClose={() => {
          setToolsOpen(false);
          if (restoreToolsFocus.current) {
            const trigger = toolsButton.current;
            if (trigger?.getClientRects().length) trigger.focus();
            else menuButton.current?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeTools();
        }}
      >
        <div className="admin-panel-heading">
          <div>
            <h2 id="admin-tools-title">Restaurant tools</h2>
            <p>Find reservations, menus, reports and other tools.</p>
          </div>
          <button
            type="button"
            className="admin-icon-button"
            aria-label="Close restaurant tools"
            onClick={closeTools}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <label className="admin-search admin-tools-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={toolsSearch}
            type="search"
            aria-label="Search restaurant tools"
            value={toolsQuery}
            onChange={(event) => setToolsQuery(event.target.value)}
            placeholder="Find a tool…"
          />
        </label>
        <nav
          className="admin-tools-links"
          aria-label="Additional restaurant tools"
        >
          {visibleTools.map(([label, , path]) => {
            const Icon = toolIcons[path] || Settings2;
            return (
              <Link
                key={path}
                to={path}
                aria-current={location.pathname === path ? "page" : undefined}
                onClick={() => {
                  restoreToolsFocus.current = location.pathname === path;
                  closeTools();
                }}
              >
                <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
        {!visibleTools.length && (
          <p className="admin-tools-empty" role="status">
            No matching tools. Try another search.
          </p>
        )}
      </dialog>
      <dialog
        className="admin-profile-drawer"
        ref={profile}
        aria-labelledby="admin-profile-title"
        onClose={() => profileButton.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) profile.current?.close();
        }}
      >
        <div className="admin-panel-heading">
          <h2 id="admin-profile-title">Your workspace</h2>
          <button
            className="admin-icon-button"
            aria-label="Close profile"
            onClick={() => profile.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <span className="admin-avatar admin-profile-avatar">{initials}</span>
        <h3>{user.name}</h3>
        <p>{user.email}</p>
        <span className="admin-badge">
          {user.roles.join(", ").replaceAll("_", " ")}
        </span>
        <Link
          className="admin-button admin-button--secondary"
          to="/account"
          onClick={() => profile.current?.close()}
        >
          Profile & security <ArrowUpRight size={16} />
        </Link>
        <Link
          className="admin-button admin-button--secondary"
          to="/settings"
          onClick={() => profile.current?.close()}
        >
          Workspace preferences <Settings2 size={16} />
        </Link>
        <button
          className="admin-button admin-button--secondary"
          onClick={() => {
            profile.current?.close();
            onSignOut();
          }}
        >
          <LogOut size={17} /> Sign out
        </button>
      </dialog>
      <MobileWorkspaceChrome
        user={user}
        pathname={location.pathname}
        theme={theme}
        toggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        onSignOut={onSignOut}
        extraTab={
          compactScreen ? (
            <Notifications
              user={user}
              variant="tab"
              showBadge={user.preferences?.show_notification_badge !== false}
            />
          ) : null
        }
      />
      {compactScreen && <RiderPullToRefresh />}
    </div>
  );
}
