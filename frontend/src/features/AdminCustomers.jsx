import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { EmptyState, Feedback, Skeleton } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { OrderStatusPill } from "../components/OrderStatusPill";
import { useConfirm, usePrompt } from "../components/ConfirmProvider";
import "./adminCustomers.css";

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value) =>
  value
    ? new Date(value).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
const readable = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());

/** Administrators: every customer account, its activity, and access. */
export function AdminCustomers() {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState("");
  const request = useRef(null);

  // Typing settles for a moment before the list reloads.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    const params = new URLSearchParams({ page: String(page), per_page: "25" });
    if (query) params.set("search", query);
    if (status) params.set("status", status);
    try {
      const result = await api(`/admin/customers?${params}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRows(result.data || []);
      setMeta({
        page: result.current_page || 1,
        lastPage: result.last_page || 1,
        total: result.total ?? (result.data || []).length,
        from: result.from || 0,
        to: result.to || 0,
      });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const stop = subscribeToLiveChanges(load, ["accounts", "orders"]);
    return () => {
      stop();
      request.current?.abort();
    };
  }, [page, query, status]);

  async function toggleAccess(customer) {
    if (
      customer.is_active &&
      !(await confirm(
        `${customer.name} will be signed out and won't be able to order or book until you reactivate the account.`,
        {
          title: "Deactivate this customer?",
          confirmLabel: "Deactivate",
          destructive: true,
        },
      ))
    )
      return false;
    try {
      await api(`/admin/users/${customer.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !customer.is_active }),
      });
      setRows((current) =>
        current.map((row) =>
          row.id === customer.id ? { ...row, is_active: !row.is_active } : row,
        ),
      );
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    }
  }

  // Cannot be undone, so the administrator types DELETE to go ahead.
  async function deleteAccount(customer) {
    const typed = await prompt(`Delete ${customer.name}'s account?`, "", {
      description:
        "They're signed out and the account is removed for good. Past orders and payments stay for your records, without their name or contact details. Type DELETE to confirm.",
      confirmLabel: "Delete account",
      destructive: true,
    });
    if (typed === null) return false;
    if (String(typed).trim().toUpperCase() !== "DELETE") {
      setError("Type DELETE to confirm deleting the account.");
      return false;
    }
    try {
      await api(`/admin/customers/${customer.id}`, { method: "DELETE" });
      setRows((current) => current.filter((row) => row.id !== customer.id));
      setMeta((current) =>
        current
          ? { ...current, total: Math.max(0, current.total - 1) }
          : current,
      );
      setNotice(`${customer.name}'s account was deleted.`);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    }
  }

  return (
    <section className="welcome admin-customers">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Customers</h1>
      <p>
        Everyone with a customer account: who they are, what they've ordered,
        and whether they can sign in.
      </p>

      <div className="admin-customers-tools">
        <label className="admin-customers-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search customers</span>
          <input
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div
          className="admin-customers-chips"
          role="group"
          aria-label="Account status"
        >
          {[
            ["", "All"],
            ["active", "Active"],
            ["inactive", "Deactivated"],
          ].map(([value, text]) => (
            <button
              key={value || "all"}
              type="button"
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {loading && <Skeleton label="Loading customers" />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title={query || status ? "No customers match" : "No customers yet"}
          description={
            query || status
              ? "Try another name, email or status."
              : "Customer accounts appear here once people sign up."
          }
        />
      )}
      {!loading && meta && rows.length > 0 && (
        <p className="admin-customers-count">
          {meta.total} {meta.total === 1 ? "customer" : "customers"}
        </p>
      )}
      <ul className="admin-customers-list">
        {rows.map((customer) => (
          <li
            key={customer.id}
            data-inactive={!customer.is_active || undefined}
          >
            <span className="admin-customers-avatar" aria-hidden="true">
              {customer.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="admin-customers-who">
              <strong>{customer.name}</strong>
              <small>{customer.email}</small>
              <small>
                Joined {day(customer.joined_at)}
                {!customer.is_active && (
                  <span className="admin-customers-off"> · Deactivated</span>
                )}
              </small>
            </div>
            <dl className="admin-customers-stats">
              <div>
                <dt>Orders</dt>
                <dd>{customer.orders_count}</dd>
              </div>
              <div>
                <dt>Spent</dt>
                <dd>{peso(customer.total_spent)}</dd>
              </div>
              <div>
                <dt>Last order</dt>
                <dd>
                  {customer.last_order_at ? day(customer.last_order_at) : "—"}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="admin-customers-view"
              onClick={() => setOpenId(customer.id)}
              aria-label={`View ${customer.name}`}
            >
              View
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {!loading && meta && meta.lastPage > 1 && (
        <Pagination
          page={meta.page}
          lastPage={meta.lastPage}
          total={meta.total}
          from={meta.from}
          to={meta.to}
          onChange={(value) => {
            setPage(value);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
      {openId && (
        <CustomerSheet
          id={openId}
          onClose={() => setOpenId(null)}
          onToggle={toggleAccess}
          onDelete={async (customer) => {
            if (await deleteAccount(customer)) setOpenId(null);
          }}
        />
      )}
    </section>
  );
}

function CustomerSheet({ id, onClose, onToggle, onDelete }) {
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api(`/admin/customers/${id}`, { signal: controller.signal })
      .then((result) => setCustomer(result.data))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function toggle() {
    setBusy(true);
    if (await onToggle(customer))
      setCustomer((current) => ({ ...current, is_active: !current.is_active }));
    setBusy(false);
  }

  return (
    <div className="admin-customer-layer">
      <button
        type="button"
        className="admin-customer-scrim"
        aria-label="Close"
        onClick={onClose}
      />
      <section
        className="admin-customer-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={customer ? customer.name : "Customer"}
      >
        <header>
          <span className="admin-customers-avatar" aria-hidden="true">
            {customer?.name?.slice(0, 1).toUpperCase() || "?"}
          </span>
          <div>
            <h2>{customer?.name || "Loading…"}</h2>
            {customer && (
              <small data-inactive={!customer.is_active || undefined}>
                {customer.is_active ? "Active account" : "Deactivated"} · Joined{" "}
                {day(customer.joined_at)}
              </small>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="admin-customer-body">
          {error && <Feedback>{error}</Feedback>}
          {!customer && !error && (
            <Skeleton cards={2} label="Loading customer" />
          )}
          {customer && (
            <>
              <ul className="admin-customer-contact">
                <li>
                  <Mail size={16} aria-hidden="true" />
                  {customer.email}
                </li>
                {customer.phone && (
                  <li>
                    <Phone size={16} aria-hidden="true" />
                    {customer.phone}
                  </li>
                )}
              </ul>
              <dl className="admin-customer-facts">
                <div>
                  <dt>Orders</dt>
                  <dd>{customer.orders_count}</dd>
                </div>
                <div>
                  <dt>Spent</dt>
                  <dd>{peso(customer.total_spent)}</dd>
                </div>
                <div>
                  <dt>Bookings</dt>
                  <dd>{customer.reservations_count}</dd>
                </div>
              </dl>

              <section>
                <h3>
                  <ShoppingBag size={15} aria-hidden="true" />
                  Recent orders
                </h3>
                {customer.recent_orders.length ? (
                  <ul className="admin-customer-rows">
                    {customer.recent_orders.map((order) => (
                      <li key={order.id}>
                        <span>
                          <strong>{order.order_number}</strong>
                          <small>
                            {readable(order.order_type)} ·{" "}
                            {day(order.created_at)}
                          </small>
                        </span>
                        <OrderStatusPill status={order.status} />
                        <b>{peso(order.total)}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-customer-none">No orders yet.</p>
                )}
              </section>

              <section>
                <h3>
                  <CalendarDays size={15} aria-hidden="true" />
                  Bookings
                </h3>
                {customer.reservations.length ? (
                  <ul className="admin-customer-rows">
                    {customer.reservations.map((booking) => (
                      <li key={booking.id}>
                        <span>
                          <strong>{day(booking.starts_at)}</strong>
                          <small>
                            {booking.reference} · {booking.guest_count}{" "}
                            {booking.guest_count === 1 ? "guest" : "guests"}
                          </small>
                        </span>
                        <span className="admin-customer-tag">
                          {readable(booking.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-customer-none">No bookings yet.</p>
                )}
              </section>

              <section>
                <h3>
                  <MapPin size={15} aria-hidden="true" />
                  Saved addresses
                </h3>
                {customer.addresses.length ? (
                  <ul className="admin-customer-rows">
                    {customer.addresses.map((address) => (
                      <li key={address.id}>
                        <span>
                          <strong>
                            {address.label}
                            {address.is_default ? " · Default" : ""}
                          </strong>
                          <small>{address.formatted_address}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-customer-none">No saved addresses.</p>
                )}
              </section>

              <div className="admin-customer-actions">
                <button
                  type="button"
                  className="admin-customer-delete"
                  disabled={busy}
                  onClick={() => onDelete(customer)}
                >
                  Delete account
                </button>
                <button
                  type="button"
                  className={
                    customer.is_active
                      ? "admin-customer-danger"
                      : "admin-customer-primary"
                  }
                  disabled={busy}
                  onClick={toggle}
                >
                  {customer.is_active
                    ? "Deactivate account"
                    : "Reactivate account"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
