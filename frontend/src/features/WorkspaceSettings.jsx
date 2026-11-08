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
import { defaultStartPath, visibleNavigation } from "../navigation";
import { Button, Feedback, PageHeader, Skeleton } from "../components/ui";
import { DeleteCustomerAccount } from "../components/DeleteCustomerAccount";
import { CardHeading, useAdminDesktop } from "../components/adminDesk";
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
  const desk = useAdminDesktop();
  const links = visibleNavigation(user.permissions, user.roles);
  // With no saved choice, show the page this role lands on (same rule as
  // the app's "/" redirect) instead of a vague "Role default" option.
  const roleStartPage = defaultStartPath(links, user.roles);
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
  // Riders manage identity, password and rider details on the Account page.
  const isRider = user.roles.includes("rider");
  const role = (
    <span className="workspace-role">
      {user.roles.join(" · ").replaceAll("_", " ")}
    </span>
  );
  return (
    <section
      className={`workspace-settings${isRider ? " workspace-settings--rider" : ""}`}
    >
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
          {desk ? (
            <CardHeading
              id="preferences-heading"
              icon={Settings2}
              title="Workspace preferences"
              description="Choose how your workspace looks and feels."
            />
          ) : (
            <div className="workspace-card-heading">
              <div>
                <h2 id="preferences-heading">
                  <Settings2 size={19} aria-hidden="true" />
                  Workspace preferences
                </h2>
                <p>Choose how your workspace looks and feels.</p>
              </div>
            </div>
          )}
          {error && <Feedback>{error}</Feedback>}
          {notice && <Feedback tone="success">{notice}</Feedback>}
          <label className="workspace-start-page">
            Start page
            <select
              value={draft.home_page || roleStartPage}
              onChange={(e) =>
                setDraft({ ...draft, home_page: e.target.value })
              }
            >
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
          className={`workspace-card workspace-account-card${isRider ? " workspace-account-card--rider" : ""}`}
          aria-labelledby="account-controls-heading"
        >
          {desk ? (
            <CardHeading
              id="account-controls-heading"
              icon={ShieldCheck}
              title="Your account"
              description="Your sign-in and the restaurant controls you can open."
            />
          ) : (
            <h2 id="account-controls-heading">
              <ShieldCheck size={19} aria-hidden="true" />
              Your account
            </h2>
          )}
          <div className="workspace-account-identity">
            <span className="workspace-account-avatar" aria-hidden="true">
              {user.name.slice(0, 1)}
            </span>
            <div>
              <strong>{user.name}</strong>
              <p className="workspace-muted">{user.email}</p>
              {isRider && role}
            </div>
          </div>
          {!isRider && role}
          {isRider ? (
            <div className="workspace-settings-links">
              <Link to="/account">
                Manage account
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <p>Update your name or password in Profile & security below.</p>
          )}
          {!isRider && management.length > 0 && (
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
      {user.roles.includes("customer") && (
        <Suspense
          fallback={<Skeleton cards={1} label="Loading saved addresses" />}
        >
          <SavedDeliveryAddresses user={user} />
        </Suspense>
      )}
      {!isRider && (
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
      )}
      {user.roles.length === 1 && user.roles[0] === "customer" && (
        <DeleteCustomerAccount user={user} onDeleted={onDeleted} />
      )}
    </section>
  );
}
