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
import { adminModuleForPath, adminNavigation } from "./adminNavigation";
import { Notifications } from "./Notifications";
import { useWorkspaceTheme } from "./useWorkspaceTheme";
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
const searchable = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

export function AdminShell({ user, onSignOut, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useWorkspaceTheme();
  const [branding, setBranding] = useState("DineFlow");
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
  const location = useLocation();
  const links = visibleNavigation(user.permissions, user.roles);
  const { primary, tools } = adminNavigation(links);
  const currentModule = adminModuleForPath(location.pathname, primary);
  const searchWords = searchable(toolsQuery).trim().split(/\s+/);
  const visibleTools = tools.filter(([label]) =>
    searchWords.every((word) => searchable(label).includes(word)),
  );
  const current =
    detailTitles[location.pathname] ||
    currentModule?.label ||
    navigationContext(location.pathname, links).title;
  const breadcrumbParent = detailTitles[location.pathname]
    ? currentModule
    : null;
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
  useEffect(() => {
    const controller = new AbortController();
    api("/restaurant/branding", { signal: controller.signal })
      .then((result) => setBranding(result.data?.name || "DineFlow"))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    document.title = `${current} · ${branding}`;
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
  }, [location.pathname, current, branding]);
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
  function navigation() {
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
          {tools.length > 0 && (
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
      <aside className="admin-sidebar">{navigation()}</aside>
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
            <span className="admin-topbar-status">
              {user.roles.includes("administrator")
                ? "Restaurant admin"
                : "Restaurant manager"}
            </span>
            <button
              className="admin-icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <Notifications
              showBadge={user.preferences?.show_notification_badge !== false}
            />
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
        >
          {children}
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
    </div>
  );
}
