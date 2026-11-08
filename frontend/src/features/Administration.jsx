import { subscribeToLiveChanges } from "../liveUpdates";
import { EmptyState, Feedback, Skeleton } from "../components/ui";

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { NewPasswordFields } from "../components/NewPasswordFields";
import { validateNewPasswordForm } from "../components/passwordValidation";
import { Pagination } from "../components/Pagination";
import {
  ChevronRight,
  Clock3,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useMediaQuery } from "../components/useMediaQuery";
import { useConfirm } from "../components/ConfirmProvider";
import { CardHeading, useAdminDesktop } from "../components/adminDesk";
import "./reservationAdmin.css";
import "./adminCustomers.css";
import "./teamPhone.css";
const ACCOUNTS_PER_PAGE = 10;
const roleOf = (person) => person.roles?.[0]?.name || "";
const byName = (a, b) => a.name.localeCompare(b.name);
// Admin desktop: how the accounts list can be ordered.
const ACCOUNT_SORTS = [
  ["name", "Name: A–Z", byName],
  ["name-desc", "Name: Z–A", (a, b) => byName(b, a)],
  [
    "role",
    "Role",
    (a, b) => roleOf(a).localeCompare(roleOf(b)) || byName(a, b),
  ],
  [
    "active",
    "Active first",
    (a, b) => b.is_active - a.is_active || byName(a, b),
  ],
  [
    "inactive",
    "Deactivated first",
    (a, b) => a.is_active - b.is_active || byName(a, b),
  ],
];

export function StaffAccounts() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState({});
  // Phones: a searchable list; details and the new-account form open in sheets.
  const phone = useMediaQuery("(max-width: 850px)");
  const desk = useAdminDesktop();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  // Admin desktop: the accounts list, ten people a page.
  const [accountPage, setAccountPage] = useState(1);
  const [accountSort, setAccountSort] = useState("name");
  // Admin desktop: Add employee opens the staff form in a modal.
  const staffDialog = useRef(null);
  useEffect(() => {
    const dialog = staffDialog.current;
    if (!dialog) return;
    if (desk && adding && !dialog.open) dialog.showModal();
    if (!(desk && adding) && dialog.open) dialog.close();
  }, [adding, desk]);
  async function load() {
    setError("");
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        api("/admin/users"),
        api("/admin/roles"),
      ]);
      setData(usersResponse.data || []);
      setRoles(rolesResponse.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load);
  }, []);
  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (creating || !validateNewPasswordForm(form)) return;
    setCreating(true);
    setError("");
    setErrors({});
    setNotice("");
    const values = Object.fromEntries(new FormData(form));
    try {
      await api("/admin/users", {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      setNotice("Staff account created.");
      setAdding(false);
      await load();
    } catch (e) {
      setError(e.message);
      setErrors(e.errors || {});
    } finally {
      setCreating(false);
    }
  }
  async function toggle(user) {
    try {
      await api(`/admin/users/${user.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function sendReset(person) {
    setError("");
    setNotice("");
    if (
      !(await confirm(
        `${person.name} will get an email at ${person.email} with a link to choose a new password. Their current password keeps working until they do.`,
        { title: "Send a password reset link?", confirmLabel: "Send link" },
      ))
    )
      return;
    try {
      await api(`/admin/users/${person.id}/password-reset`, { method: "POST" });
      setNotice(`Reset link sent to ${person.email}.`);
    } catch (e) {
      setError(e.message);
    }
  }
  async function setRole(user, role) {
    try {
      await api(`/admin/users/${user.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  const accountTerm = search.trim().toLowerCase();
  const accounts = desk
    ? data
        .filter((person) =>
          [person.name, person.email, roleOf(person)].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(accountTerm),
          ),
        )
        .sort(ACCOUNT_SORTS.find(([key]) => key === accountSort)[2])
    : data;
  const accountPages = Math.max(
    1,
    Math.ceil(accounts.length / ACCOUNTS_PER_PAGE),
  );
  const accountStatus = (person) => (
    <span className={person.is_active ? "status-active" : "status-inactive"}>
      {person.is_active ? "Active" : "Deactivated"}
    </span>
  );
  const staffForm = (
    <form
      className="staff-form"
      onSubmit={create}
      aria-busy={creating}
      aria-labelledby="staff-form-heading"
    >
      {desk ? (
        <CardHeading
          id="staff-form-heading"
          icon={UserPlus}
          title="Add a staff member"
          description="Give someone on your team their own sign-in and role."
        />
      ) : (
        <h2 id="staff-form-heading">Add a staff member</h2>
      )}
      <label>
        Name
        <input name="name" required maxLength="120" />
      </label>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <NewPasswordFields
        passwordLabel="Temporary password"
        errors={errors}
        onEdit={() =>
          setErrors((current) => ({
            ...current,
            password: undefined,
            password_confirmation: undefined,
          }))
        }
      />
      <label>
        Role
        <select name="role" required>
          {roles
            .filter((r) => r.slug !== "customer")
            .map((r) => (
              <option value={r.slug} key={r.slug}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <button disabled={creating}>
        {creating ? "Creating account…" : "Create staff account"}
      </button>
    </form>
  );
  if (phone) {
    const term = search.trim().toLowerCase();
    const visible = data.filter(
      (person) =>
        !term ||
        person.name.toLowerCase().includes(term) ||
        person.email.toLowerCase().includes(term),
    );
    const selected = data.find((person) => person.id === selectedId);
    return (
      <section className="welcome admin-users admin-users--phone">
        <h1 className="sr-only">Team & access</h1>
        {error && <Feedback onRetry={load}>{error}</Feedback>}
        {notice && <Feedback tone="success">{notice}</Feedback>}
        <div className="team-phone-tools">
          <label className="admin-customers-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search team</span>
            <input
              type="search"
              placeholder="Search by name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="team-phone-add"
            onClick={() => setAdding(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Add staff
          </button>
        </div>
        {loading && <Skeleton label="Loading your team" />}
        {!loading && (
          <p className="team-phone-meta">
            {visible.length} {visible.length === 1 ? "person" : "people"}
          </p>
        )}
        {!loading && !visible.length && (
          <EmptyState
            compact
            title={term ? "No one matches" : "Your team starts here"}
            description={
              term
                ? "Try another name or email."
                : "Add a staff account and choose the right role for each person."
            }
          />
        )}
        <ul className="team-phone-list">
          {visible.map((person) => (
            <li key={person.id} data-inactive={!person.is_active || undefined}>
              <span className="admin-customers-avatar" aria-hidden="true">
                {person.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="team-phone-main">
                <strong>{person.name}</strong>
                <small>{person.email}</small>
                <span className="team-phone-badges">
                  <span>{person.roles?.[0]?.name || "No role"}</span>
                  {!person.is_active && (
                    <span data-tone="off">Deactivated</span>
                  )}
                </span>
              </span>
              <button
                type="button"
                className="team-phone-view"
                onClick={() => setSelectedId(person.id)}
                aria-label={`View ${person.name}`}
              >
                View <ChevronRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <TeamSheet title={selected.name} onClose={() => setSelectedId(null)}>
            <p className="team-sheet-line">{selected.email}</p>
            <label className="team-sheet-field">
              Role
              <select
                value={selected.roles?.[0]?.slug || ""}
                onChange={(event) => setRole(selected, event.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="team-sheet-line">
              {selected.is_active
                ? "This account can sign in."
                : "This account is deactivated and can’t sign in."}
            </p>
            <div className="team-sheet-actions">
              <button
                type="button"
                className="ui-button ui-button--secondary"
                disabled={!selected.is_active}
                title={
                  selected.is_active
                    ? `Email ${selected.name} a link to choose a new password`
                    : "Reactivate this account first"
                }
                onClick={() => sendReset(selected)}
              >
                Reset password
              </button>
              <button
                type="button"
                className={`team-sheet-toggle ui-button ui-button--${selected.is_active ? "danger" : "secondary"}`}
                onClick={() => toggle(selected)}
              >
                {selected.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </TeamSheet>
        )}
        {adding && (
          <TeamSheet
            title="Add a staff member"
            onClose={() => setAdding(false)}
          >
            {staffForm}
          </TeamSheet>
        )}
      </section>
    );
  }
  return (
    <section className="welcome admin-users">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Team & access</h1>
      <p>
        Create and manage staff accounts. The API verifies every permission
        change.
      </p>
      {loading && (
        <Skeleton
          label="Loading your content"
          layout={{ body: "table", rows: 8, toolbar: true }}
        />
      )}
      {!loading && !error && data.length === 0 && (
        <EmptyState
          title="Your team starts here"
          description="Create a staff account and choose the right role for each person."
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {!phone && !desk && staffForm}
      {desk && (
        <dialog
          ref={staffDialog}
          className="staff-dialog"
          onClose={() => setAdding(false)}
        >
          <button
            type="button"
            className="staff-dialog-close"
            aria-label="Close"
            disabled={creating}
            onClick={() => setAdding(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
          {adding && staffForm}
        </dialog>
      )}
      <div className="staff-list">
        {desk ? (
          <CardHeading
            icon={Users}
            title="Accounts"
            description="Change a role or turn off access for anyone on your team."
            actions={
              <button
                type="button"
                className="sage-button staff-add-button"
                onClick={() => {
                  setNotice("");
                  setAdding(true);
                }}
              >
                <UserPlus size={16} aria-hidden="true" />
                Add employee
              </button>
            }
          />
        ) : (
          <h2>Accounts</h2>
        )}
        {desk && data.length > 0 && (
          <div className="staff-toolbar">
            <label className="staff-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search team</span>
              <input
                type="search"
                placeholder="Search by name, email or role"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setAccountPage(1);
                }}
              />
            </label>
            <select
              className="staff-sort"
              aria-label="Sort accounts"
              value={accountSort}
              onChange={(event) => {
                setAccountSort(event.target.value);
                setAccountPage(1);
              }}
            >
              {ACCOUNT_SORTS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        {desk && data.length > 0 && accounts.length === 0 && (
          <p className="staff-no-match">No one matches “{search.trim()}”.</p>
        )}
        {(desk
          ? accounts.slice(
              (Math.min(accountPage, accountPages) - 1) * ACCOUNTS_PER_PAGE,
              Math.min(accountPage, accountPages) * ACCOUNTS_PER_PAGE,
            )
          : accounts
        ).map((person) => (
          <article
            key={person.id}
            data-inactive={!person.is_active || undefined}
          >
            {desk && (
              <span
                className="staff-avatar"
                data-role={person.roles?.[0]?.slug}
                aria-hidden="true"
              >
                {String(person.name || "?")
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </span>
            )}
            <div>
              {desk ? (
                <span className="staff-name-line">
                  <strong>{person.name}</strong>
                  {accountStatus(person)}
                </span>
              ) : (
                <strong>{person.name}</strong>
              )}
              <small>{person.email}</small>
            </div>
            <select
              aria-label={`Role for ${person.name}`}
              value={person.roles?.[0]?.slug || ""}
              onChange={(e) => setRole(person, e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
            {!desk && accountStatus(person)}
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={!person.is_active}
              title={
                person.is_active
                  ? `Email ${person.name} a link to choose a new password`
                  : "Reactivate this account first"
              }
              onClick={() => sendReset(person)}
            >
              Reset password
            </button>
            <button
              type="button"
              className={`ui-button ui-button--${person.is_active ? "danger" : "secondary"}`}
              onClick={() => toggle(person)}
            >
              {person.is_active ? "Deactivate" : "Reactivate"}
            </button>
          </article>
        ))}
        {desk && accounts.length > ACCOUNTS_PER_PAGE && (
          <Pagination
            page={Math.min(accountPage, accountPages)}
            lastPage={accountPages}
            total={accounts.length}
            from={
              (Math.min(accountPage, accountPages) - 1) * ACCOUNTS_PER_PAGE + 1
            }
            to={Math.min(
              Math.min(accountPage, accountPages) * ACCOUNTS_PER_PAGE,
              accounts.length,
            )}
            onChange={setAccountPage}
          />
        )}
      </div>
    </section>
  );
}

/** A bottom sheet in the same style as the customer details sheet. */
function TeamSheet({ title, onClose, children }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="admin-customer-layer">
      <button
        type="button"
        className="admin-customer-scrim"
        aria-label="Close"
        onClick={onClose}
      />
      <section
        className="admin-customer-sheet team-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="admin-customer-body team-sheet-body">{children}</div>
      </section>
    </div>
  );
}

export function AuditLogView() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });
  const requestVersion = useRef(0);
  async function load() {
    const version = ++requestVersion.current;
    setError("");
    try {
      const result = await api(`/admin/audit-logs?page=${page}&per_page=20`);
      if (version !== requestVersion.current) return;
      setEvents(result.data || []);
      setMeta(result);
    } catch (failure) {
      if (version === requestVersion.current) setError(failure.message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    load();
    const stop = subscribeToLiveChanges(load);
    return () => {
      requestVersion.current++;
      stop();
    };
  }, [page]);
  return (
    <section className="welcome audit-workspace">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Audit log</h1>
      <p>
        Review account activity, settings changes, and restaurant operations.
      </p>
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {loading && (
        <Skeleton
          label="Loading audit history"
          layout={{ body: "list", rows: 8 }}
        />
      )}
      {!loading && !error && !events.length && (
        <EmptyState
          title="A clear record, from day one"
          description="Account and permission changes will appear here."
        />
      )}
      <div className="audit-panel">
        <header className="audit-panel-heading">
          <ShieldCheck size={19} aria-hidden="true" />
          <div>
            <h2>Activity history</h2>
            <p>
              Newest activity first · {meta.total || events.length} recorded
              events
            </p>
          </div>
        </header>
        <div className="audit-list" aria-busy={loading}>
          {events.map((event) => (
            <article key={event.id}>
              <span className="audit-event-icon">
                <ShieldCheck size={17} aria-hidden="true" />
              </span>
              <div>
                <strong>
                  {event.event
                    .replaceAll(/[._]/g, " ")
                    .replace(/^\w/, (c) => c.toUpperCase())}
                </strong>
                <small>
                  <UserRound size={13} aria-hidden="true" />
                  {event.actor?.name || "System"}
                  <span>·</span>
                  <Clock3 size={13} aria-hidden="true" />
                  <time dateTime={event.created_at}>
                    {new Date(event.created_at).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </small>
              </div>
              <span className="audit-subject">
                {event.subject_type
                  ? `${event.subject_type
                      .split("\\")
                      .at(-1)
                      .replace(
                        /([a-z])([A-Z])/g,
                        "$1 $2",
                      )} #${event.subject_id}`
                  : "System event"}
              </span>
            </article>
          ))}
        </div>
        <Pagination
          page={page}
          lastPage={meta.last_page || 1}
          total={meta.total ?? events.length}
          from={meta.from || (events.length ? 1 : 0)}
          to={meta.to || events.length}
          disabled={loading}
          onChange={setPage}
        />
      </div>
    </section>
  );
}
