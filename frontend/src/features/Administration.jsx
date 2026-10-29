import { EmptyState, Feedback, Skeleton } from "../components/ui";

import { useEffect, useState } from "react";
import { api } from "../api";
import { NewPasswordFields } from "../components/NewPasswordFields";
import { validateNewPasswordForm } from "../components/passwordValidation";
export function StaffAccounts() {
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState({});
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
  return (
    <section className="welcome admin-users">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Team & access</h1>
      <p>
        Create and manage staff accounts. The API verifies every permission
        change.
      </p>
      {loading && <Skeleton label="Loading your content" />}
      {!loading && !error && data.length === 0 && (
        <EmptyState
          title="Your team starts here"
          description="Create a staff account and choose the right role for each person."
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <form className="staff-form" onSubmit={create} aria-busy={creating}>
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
      <div className="staff-list">
        <h2>Accounts</h2>
        {data.map((person) => (
          <article key={person.id}>
            <div>
              <strong>{person.name}</strong>
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
            <span
              className={person.is_active ? "status-active" : "status-inactive"}
            >
              {person.is_active ? "Active" : "Deactivated"}
            </span>
            <button type="button" onClick={() => toggle(person)}>
              {person.is_active ? "Deactivate" : "Reactivate"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AuditLogView() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const result = await api("/admin/audit-logs");
      setEvents(result.data || []);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="welcome">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Audit log</h1>
      <p>Recorded account and permission changes.</p>
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {loading && <Skeleton label="Loading audit history" />}
      {!loading && !error && !events.length && (
        <EmptyState
          title="A clear record, from day one"
          description="Account and permission changes will appear here."
        />
      )}
      <div className="staff-list">
        {events.map((event) => (
          <article key={event.id}>
            <div>
              <strong>{event.event}</strong>
              <small>
                {event.actor?.name || "System"} · {event.created_at}
              </small>
            </div>
            <span>
              {event.subject_type
                ? `${event.subject_type} #${event.subject_id}`
                : "System event"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
