import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Account } from "../Account";
import { api } from "../api";
import { visibleNavigation } from "../navigation";
import { Button, Feedback, PageHeader, Skeleton } from "../components/ui";
import { RiderProfileSettings } from "./RiderWorkspace";
import { DeleteCustomerAccount } from "../components/DeleteCustomerAccount";
import "./workspaceSettings.css";
import "./settingsPage.css";

const SavedDeliveryAddresses = lazy(
  () => import("../components/SavedDeliveryAddresses"),
);
const defaults = {
  home_page: "",
  compact_view: false,
  reduced_motion: false,
  show_notification_badge: true,
};

export function WorkspaceSettings({ user, onUpdated, onDeleted }) {
  const links = visibleNavigation(user.permissions, user.roles);
  const [draft, setDraft] = useState({
    ...defaults,
    ...user.preferences,
    home_page: user.preferences?.home_page || "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const management = links.filter(
    ([, permission, path]) =>
      permission === "settings.manage" ||
      ["/admin/users", "/admin/audit"].includes(path),
  );
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/me/preferences", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      onUpdated(result.user);
      setDraft({
        ...defaults,
        ...result.user.preferences,
        home_page: result.user.preferences?.home_page || "",
      });
      setNotice("Preferences saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-settings">
      <PageHeader
        title="Settings"
        description="Your account, preferences and workspace controls."
      />
      <div className="workspace-settings-grid">
        <form
          className="workspace-card workspace-preferences"
          onSubmit={save}
          aria-labelledby="preferences-heading"
        >
          <div className="workspace-card-heading">
            <div>
              <h2 id="preferences-heading">
                <Settings2 size={19} aria-hidden="true" />
                Workspace preferences
              </h2>
              <p>Choose how your workspace looks and feels.</p>
            </div>
          </div>
          {error && <Feedback>{error}</Feedback>}
          {notice && <Feedback tone="success">{notice}</Feedback>}
          <label className="workspace-start-page">
            Start page
            <select
              value={draft.home_page || ""}
              onChange={(e) =>
                setDraft({ ...draft, home_page: e.target.value })
              }
            >
              <option value="">Role default</option>
              {links.map(([label, , to]) => (
                <option key={to} value={to}>
                  {label}
                </option>
              ))}
              <option value="/account">My account</option>
            </select>
            <small>Where you land after signing in.</small>
          </label>
          {[
            [
              "compact_view",
              "Compact layout",
              "Less spacing in order queues and lists.",
            ],
            [
              "reduced_motion",
              "Reduce motion",
              "Minimize interface animations.",
            ],
            [
              "show_notification_badge",
              "Unread notification badge",
              "Show the unread count beside the bell.",
            ],
          ].map(([key, label, description]) => (
            <label className="workspace-toggle" key={key}>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) =>
                  setDraft({ ...draft, [key]: e.target.checked })
                }
              />
            </label>
          ))}
          <div className="workspace-form-actions">
            <Button type="submit" busy={busy}>
              Save preferences
            </Button>
          </div>
        </form>
        <section
          className="workspace-card workspace-account-card"
          aria-labelledby="account-controls-heading"
        >
          <h2 id="account-controls-heading">
            <ShieldCheck size={19} aria-hidden="true" />
            Your account
          </h2>
          <div className="workspace-account-identity">
            <span className="workspace-account-avatar" aria-hidden="true">
              {user.name.slice(0, 1)}
            </span>
            <div>
              <strong>{user.name}</strong>
              <p className="workspace-muted">{user.email}</p>
            </div>
          </div>
          <span className="workspace-role">
            {user.roles.join(" · ").replaceAll("_", " ")}
          </span>
          <p>Update your name or password in Profile & security below.</p>
          {user.roles.includes("rider") && (
            <p className="workspace-location-note">
              Going online shares your GPS for offers and accepted deliveries.
              Use the availability bar to stop sharing.
            </p>
          )}
          {management.length > 0 && (
            <>
              <h3>Restaurant controls</h3>
              <div className="workspace-settings-links">
                {management.map(([label, , to]) => (
                  <Link key={to} to={to}>
                    {label}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      {user.roles.includes("rider") &&
        user.permissions.includes("deliveries.assigned") && (
          <RiderProfileSettings />
        )}
      {user.roles.includes("customer") && (
        <Suspense
          fallback={<Skeleton cards={1} label="Loading saved addresses" />}
        >
          <SavedDeliveryAddresses user={user} />
        </Suspense>
      )}
      <details className="workspace-security">
        <summary>
          <span>
            <ShieldCheck size={19} aria-hidden="true" />
            Profile & security
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <Account
          user={user}
          onUpdated={onUpdated}
          embedded
          showAddresses={false}
        />
      </details>
      {user.roles.length === 1 && user.roles[0] === "customer" && (
        <DeleteCustomerAccount user={user} onDeleted={onDeleted} />
      )}
    </section>
  );
}
