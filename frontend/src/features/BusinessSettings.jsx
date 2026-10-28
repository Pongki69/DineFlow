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
  Store,
  Truck,
  TriangleAlert,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";
import { Button, Feedback, Field, Skeleton } from "../components/ui";
import { useSaveDock } from "../components/useSaveDock";
import "./businessSettings.css";

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
        <Skeleton label="Loading business settings" />
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
                        <span>{draft.brand_color.toUpperCase()}</span>
                      </div>
                      <small id="business-brand-color-hint">
                        Choose your restaurant’s primary brand color.
                      </small>
                    </div>
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
                <p>Open the right settings for each part of your restaurant.</p>
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
