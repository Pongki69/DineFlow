import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CreditCard,
  Palette,
  Settings2,
  ShoppingBag,
  Store,
  Truck,
  TriangleAlert,
  RefreshCw,
  UtensilsCrossed,
  ChevronDown,
} from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { Button, Feedback, Field, Skeleton } from "../components/ui";
import { useSaveDock } from "../components/useSaveDock";
import { useAdminDesktop } from "../components/adminDesk";
import { adminBrandTheme, readableBrand } from "../components/brandTheme";
import { useWorkspaceTheme } from "../components/useWorkspaceTheme";
import "./businessSettings.css";

const BRAND_PRESETS = [
  ["#1e4d3a", "Forest"],
  ["#229159", "Emerald"],
  ["#0f766e", "Teal"],
  ["#1d4ed8", "Blue"],
  ["#6d28d9", "Violet"],
  ["#b4532a", "Terracotta"],
  ["#b91c1c", "Crimson"],
  ["#334155", "Slate"],
];

/** Type any hex colour; a complete code applies straight away. */
function BrandHexInput({ value, onChange }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const complete = /^#[0-9a-f]{6}$/i.test(text);
  return (
    <input
      className="business-brand-hex"
      aria-label="Brand color hex code"
      aria-invalid={!complete || undefined}
      maxLength={7}
      spellCheck={false}
      autoComplete="off"
      placeholder="#229159"
      value={text.toUpperCase()}
      onChange={(event) => {
        let next = event.target.value.trim();
        if (next && !next.startsWith("#")) next = `#${next}`;
        setText(next);
        if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase());
      }}
      onBlur={() => setText(value)}
    />
  );
}

function settingsDraft(data) {
  const profile = data.business_profile || {};
  return {
    restaurant_name: profile.restaurant_name || "",
    timezone: profile.timezone || "Asia/Manila",
    brand_color: /^#[0-9a-f]{6}$/i.test(profile.brand_color || "")
      ? profile.brand_color
      : "#2e5a43",
    tax_percent: String(data.tax_percent ?? 0),
    service_charge_percent: String(data.service_charge_percent ?? 0),
    notifications_enabled: profile.notifications_enabled !== false,
  };
}

function useBusinessSettings() {
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(false);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (dirty || saving || loading) return;
    return subscribeToLiveChanges(async () => {
      const result = await api("/admin/settings");
      if (!mounted.current) return;
      const next = settingsDraft(result.data);
      setDraft(next);
      setSaved(next);
    }, ["settings"]);
  }, [dirty, saving, loading]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api("/admin/settings", { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const initial = settingsDraft(result.data);
        setDraft(initial);
        setSaved(initial);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [attempt]);

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (!dirty || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...draft,
          tax_percent: Number(draft.tax_percent),
          service_charge_percent: Number(draft.service_charge_percent),
        }),
      });
      if (!mounted.current) return;
      const next = settingsDraft(result.data);
      setDraft(next);
      setSaved(next);
      window.dispatchEvent(new CustomEvent("dineflow:branding-changed"));
      setNotice(
        "Business settings saved. New orders use the updated tax and service-charge rates.",
      );
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      lock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function discard() {
    setDraft(saved);
    setError("");
    setNotice("");
  }
  return {
    draft,
    dirty,
    error,
    notice,
    loading,
    saving,
    change,
    save,
    discard,
    retry: () => setAttempt((value) => value + 1),
  };
}

const relatedSettings = [
  [
    "Delivery settings",
    "Fees, delivery rules, and delivery hours",
    "/admin/delivery",
    Truck,
  ],
  [
    "Reservation settings",
    "Booking windows and table policies",
    "/admin/settings",
    CalendarDays,
  ],
  [
    "Payment settings",
    "Payment methods and checkout options",
    "/admin/payment-settings",
    CreditCard,
  ],
  [
    "Restaurant outlets",
    "Pickup location and coverage area",
    "/admin/outlets",
    Store,
  ],
];

export function BusinessSettings() {
  const settings = useBusinessSettings();
  const desk = useAdminDesktop();
  const { theme } = useWorkspaceTheme();
  const { pathname } = useLocation();
  const title =
    pathname === "/admin/system-settings"
      ? "System settings"
      : "Business settings";
  const { draft, dirty, error, notice, loading, saving, change } = settings;
  const state = saving
    ? "saving"
    : error && draft
      ? "error"
      : dirty
        ? "dirty"
        : notice
          ? "saved"
          : "clean";
  const pinned = useSaveDock(state);

  return (
    <section className="business-settings-page">
      <header className="business-settings-heading">
        {!loading && draft && (
          <span className="admin-form-status" data-state={state}>
            {saving ? (
              <RefreshCw size={15} className="spin" aria-hidden="true" />
            ) : dirty ? (
              <TriangleAlert size={15} aria-hidden="true" />
            ) : (
              <Check size={15} aria-hidden="true" />
            )}
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
          </span>
        )}
        <span className="admin-eyebrow">RESTAURANT CONFIGURATION</span>
        <h1>{title}</h1>
        <p>
          Manage your business profile, pricing rules, and operational
          preferences.
        </p>
      </header>
      {error && (
        <Feedback onRetry={!draft ? settings.retry : undefined}>
          {error}
        </Feedback>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {loading ? (
        <Skeleton
          label="Loading business settings"
          layout={{ body: "form", rows: 3 }}
        />
      ) : (
        draft && (
          <form
            className="business-settings-workspace"
            onSubmit={settings.save}
          >
            <div className="business-settings-layout">
              <div className="business-settings-sections">
                <fieldset
                  className="business-settings-card business-settings-card--profile"
                  disabled={saving}
                >
                  <legend className="sr-only">Business profile</legend>
                  <header>
                    <span className="business-settings-icon">
                      <Store size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>Business profile</h2>
                      <p>The details that identify your restaurant.</p>
                    </div>
                  </header>
                  <div className="business-settings-fields">
                    <Field
                      label="Restaurant name"
                      name="restaurant_name"
                      autoComplete="organization"
                      required
                      maxLength={120}
                      value={draft.restaurant_name}
                      onChange={(event) =>
                        change("restaurant_name", event.target.value)
                      }
                      hint="Shown throughout your restaurant workspace."
                    />
                    <Field
                      label="Time zone"
                      name="timezone"
                      required
                      maxLength={80}
                      value={draft.timezone}
                      placeholder="Asia/Manila"
                      onChange={(event) =>
                        change("timezone", event.target.value)
                      }
                      hint="Used for operating hours, reservations, and reports."
                    />
                  </div>
                </fieldset>
                <fieldset
                  className="business-settings-card business-settings-card--appearance"
                  disabled={saving}
                >
                  <legend className="sr-only">Brand appearance</legend>
                  <header>
                    <span className="business-settings-icon">
                      <Palette size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>Brand appearance</h2>
                      <p>Keep your restaurant’s identity consistent.</p>
                    </div>
                  </header>
                  <div className="business-settings-fields">
                    <div className="business-settings-color">
                      <label htmlFor="business-brand-color">Brand color</label>
                      <div>
                        <input
                          id="business-brand-color"
                          name="brand_color"
                          type="color"
                          value={draft.brand_color}
                          onChange={(event) =>
                            change("brand_color", event.target.value)
                          }
                          aria-describedby="business-brand-color-hint"
                        />
                        {desk ? (
                          <BrandHexInput
                            value={draft.brand_color}
                            onChange={(color) => change("brand_color", color)}
                          />
                        ) : (
                          <span>{draft.brand_color.toUpperCase()}</span>
                        )}
                      </div>
                      <small id="business-brand-color-hint">
                        Choose your restaurant’s primary brand color.
                        {desk &&
                          readableBrand(draft.brand_color).toLowerCase() !==
                            draft.brand_color.toLowerCase() &&
                          ` It shows as ${readableBrand(draft.brand_color).toUpperCase()} so text stays readable.`}
                      </small>
                      {desk && (
                        <div
                          className="business-brand-presets"
                          role="group"
                          aria-label="Suggested colors"
                        >
                          {BRAND_PRESETS.map(([color, name]) => (
                            <button
                              key={color}
                              type="button"
                              title={name}
                              aria-label={name}
                              aria-pressed={
                                draft.brand_color.toLowerCase() === color
                              }
                              style={{ backgroundColor: color }}
                              onClick={() => change("brand_color", color)}
                            >
                              {draft.brand_color.toLowerCase() === color && (
                                <Check size={14} aria-hidden="true" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {desk ? (
                      <div
                        className="business-brand-live"
                        style={adminBrandTheme(draft.brand_color, theme)}
                        aria-label="Preview of your brand color"
                      >
                        <div className="business-brand-live-side">
                          <span className="business-brand-live-logo">
                            <UtensilsCrossed size={15} aria-hidden="true" />
                          </span>
                          <strong>
                            {draft.restaurant_name || "Your restaurant"}
                          </strong>
                          <span data-active>Dashboard</span>
                          <span>Orders</span>
                          <span>Menu</span>
                        </div>
                        <div className="business-brand-live-main">
                          <small>Live preview</small>
                          <div>
                            <span className="business-brand-live-primary">
                              Save changes
                            </span>
                            <span className="business-brand-live-secondary">
                              Cancel
                            </span>
                          </div>
                          <div>
                            <span
                              className="business-brand-live-chip"
                              data-active
                            >
                              All 12
                            </span>
                            <span className="business-brand-live-chip">
                              Pending 3
                            </span>
                          </div>
                          <div>
                            <span className="business-brand-live-select">
                              All areas
                              <ChevronDown size={14} aria-hidden="true" />
                            </span>
                            <span className="business-brand-live-link">
                              View details
                            </span>
                          </div>
                          <div
                            className="business-brand-split"
                            role="img"
                            aria-label="Palette: 60 percent backgrounds, 30 percent panels and dropdowns, 10 percent accent"
                          >
                            <i data-part="60">60</i>
                            <i data-part="30">30</i>
                            <i data-part="10">10</i>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="business-brand-preview"
                        style={{ borderTopColor: draft.brand_color }}
                        aria-label="Brand preview"
                      >
                        <span
                          className="business-brand-swatch"
                          style={{ backgroundColor: draft.brand_color }}
                          aria-hidden="true"
                        />
                        <div>
                          <strong>
                            {draft.restaurant_name || "Your restaurant"}
                          </strong>
                          <small>Brand preview</small>
                        </div>
                      </div>
                    )}
                  </div>
                </fieldset>
                <fieldset
                  className="business-settings-card business-settings-card--notifications"
                  disabled={saving}
                >
                  <legend className="sr-only">Operational notifications</legend>
                  <header>
                    <span className="business-settings-icon">
                      <Bell size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>Notifications</h2>
                      <p>Control restaurant operational updates.</p>
                    </div>
                  </header>
                  <div className="business-settings-fields">
                    <label className="business-settings-check">
                      <input
                        name="notifications_enabled"
                        type="checkbox"
                        checked={draft.notifications_enabled}
                        onChange={(event) =>
                          change("notifications_enabled", event.target.checked)
                        }
                      />
                      <span>
                        <strong>Enable operational notifications</strong>
                        <small>
                          Send updates about restaurant orders, reservations,
                          and deliveries.
                        </small>
                      </span>
                    </label>
                    <ul
                      className="business-notification-topics"
                      aria-label="Included operational updates"
                    >
                      <li>
                        <ShoppingBag size={16} aria-hidden="true" />
                        Order activity
                      </li>
                      <li>
                        <CalendarDays size={16} aria-hidden="true" />
                        Reservation changes
                      </li>
                      <li>
                        <Truck size={16} aria-hidden="true" />
                        Delivery progress
                      </li>
                    </ul>
                  </div>
                </fieldset>
                <fieldset
                  className="business-settings-card business-settings-card--pricing"
                  disabled={saving}
                >
                  <legend className="sr-only">Pricing and charges</legend>
                  <header>
                    <span className="business-settings-icon">
                      <CreditCard size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>Pricing & charges</h2>
                      <p>Changes apply to new orders after saving.</p>
                    </div>
                  </header>
                  <div className="business-settings-fields business-settings-fields--paired">
                    <Field
                      label="Tax rate (%)"
                      name="tax_percent"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      required
                      value={draft.tax_percent}
                      onChange={(event) =>
                        change("tax_percent", event.target.value)
                      }
                      hint="Enter 0 if no tax is applied."
                    />
                    <Field
                      label="Dine-in service charge (%)"
                      name="service_charge_percent"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      required
                      value={draft.service_charge_percent}
                      onChange={(event) =>
                        change("service_charge_percent", event.target.value)
                      }
                      hint="Applied to new dine-in orders."
                    />
                  </div>
                </fieldset>
              </div>
              <aside
                className="business-settings-related"
                aria-labelledby="business-related-title"
              >
                <div className="business-settings-related-heading">
                  <Settings2 size={19} aria-hidden="true" />
                  <h2 id="business-related-title">More settings</h2>
                </div>
                <p>Manage each part of your restaurant.</p>
                <nav aria-label="Related restaurant settings">
                  {relatedSettings.map(([label, description, path, Icon]) => (
                    <Link key={path} to={path}>
                      <Icon size={18} aria-hidden="true" />
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  ))}
                </nav>
              </aside>
            </div>
            <footer
              className="business-settings-actions"
              data-state={state}
              data-pinned={pinned}
            >
              <div>
                <strong role="status" aria-live="polite">
                  {saving
                    ? "Saving your settings…"
                    : error
                      ? "Settings haven’t been saved"
                      : dirty
                        ? "You have unsaved changes"
                        : "All changes saved"}
                </strong>
                <p id="business-save-hint">
                  {saving
                    ? "Please wait while your changes are saved."
                    : dirty
                      ? "Review your changes, then save them."
                      : "Change a field to enable saving."}
                </p>
              </div>
              <div className="business-settings-action-buttons">
                <Button
                  variant="secondary"
                  disabled={!dirty || saving}
                  onClick={settings.discard}
                >
                  Discard changes
                </Button>
                <Button
                  type="submit"
                  busy={saving}
                  disabled={!dirty}
                  aria-describedby="business-save-hint"
                >
                  <Check size={17} aria-hidden="true" />
                  {saving
                    ? "Saving business settings…"
                    : "Save business settings"}
                </Button>
              </div>
            </footer>
          </form>
        )
      )}
    </section>
  );
}
