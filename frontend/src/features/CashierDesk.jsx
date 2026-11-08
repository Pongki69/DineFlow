import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  CreditCard,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  Table2,
  Truck,
  UserRoundCheck,
  Wallet,
  X,
} from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { playSound } from "../uiSound";
import { EmptyState, Feedback, Skeleton } from "../components/ui";
import {
  collectionGroups,
  counterTag,
  isUrgent,
  matchesSearch,
  peso,
  quickCashAmounts,
  tableLabel,
  waitingFor,
} from "./cashierQueue";
import { useMediaQuery } from "../components/useMediaQuery";
import "./cashierDesk.css";
import "./cashierDesktop.css";
import {
  ThermalReceipt,
  printThermalReceipt,
} from "../components/ThermalReceipt";

const GROUPS = [
  ["requested", "Asked for the bill", BellRing],
  ["tables", "Tables", Table2],
  ["counter", "Counter", ShoppingBag],
];

const billPath = (entry) =>
  `/cashier/bill?${entry.kind === "session" ? "session_id" : "order_id"}=${entry.id}`;

/** The cashier's home: what to collect now, then a sheet to take the money. */
export function CashierDesk() {
  const [bills, setBills] = useState([]);
  const [queue, setQueue] = useState({ orders: [], reservation_deposits: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [inspectedKey, setInspectedKey] = useState("");
  const [initialMethod, setInitialMethod] = useState("cash");
  const [notice, setNotice] = useState("");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  // Phones: slim rows, waiting times, and the total split into chips that
  // narrow the list to tables or the counter.
  const phone = useMediaQuery("(max-width: 850px)");
  const [only, setOnly] = useState("");
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!phone) return undefined;
    const timer = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, [phone]);
  const request = useRef(0);
  async function load() {
    const version = ++request.current;
    setRefreshing(true);
    try {
      const [billResult, queueResult] = await Promise.all([
        api("/dining-sessions/open-bills"),
        api("/cashier/payment-queue"),
      ]);
      if (version !== request.current) return;
      setBills(billResult.data || []);
      setQueue(queueResult.data || { orders: [], reservation_deposits: [] });
      setError("");
    } catch (failure) {
      if (version === request.current) setError(failure.message);
    } finally {
      if (version === request.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load);
  }, []);
  const groups = useMemo(() => collectionGroups(bills, queue), [bills, queue]);
  const inFilter = (key) =>
    !phone ||
    !only ||
    (only === "tables" ? ["requested", "tables"] : ["counter"]).includes(key);
  const visible = (key) =>
    inFilter(key)
      ? groups[key].filter((entry) => matchesSearch(entry, query))
      : [];
  const sum = (entries) =>
    entries.reduce((total, entry) => total + entry.balance, 0);
  const tablesTotal = sum([...groups.requested, ...groups.tables]);
  const counterTotal = sum(groups.counter);
  const counterEntries = [
    ...groups.requested,
    ...groups.tables,
    ...groups.counter,
  ];
  const toCollect = counterEntries.reduce(
    (sum, entry) => sum + entry.balance,
    0,
  );
  const shown = GROUPS.reduce((count, [key]) => count + visible(key).length, 0);
  const search = (
    <label className="cashier-search">
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">Find a table, order or name</span>
      <input
        type="search"
        value={query}
        placeholder="Table, order number or name"
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
  );
  const currentSelection =
    selected &&
    Object.values(groups)
      .flat()
      .find((entry) => entry.key === selected.key);
  const collection = selected && (
    <CollectSheet
      key={selected.key}
      phone={phone}
      entry={selected}
      initialMethod={phone ? "cash" : initialMethod}
      canStillPay={Boolean(
        currentSelection && !currentSelection.paymentPending,
      )}
      onClose={() => setSelected(null)}
      onPaid={(message) => {
        setNotice(message);
        load();
      }}
    />
  );
  if (!phone) {
    const rows = GROUPS.map(([key, label, Icon]) => ({
      key,
      label,
      Icon,
      entries: visible(key),
    }));
    const counter = rows.flatMap(({ entries }) => entries);
    const deliveries = visible("delivery");
    const inspected =
      [...counter, ...(deliveryOpen ? deliveries : [])].find(
        (entry) => entry.key === inspectedKey,
      ) || counter[0];
    return (
      <section
        className="cashier-desk cashier-desk--desktop"
        aria-labelledby="cashier-desk-title"
      >
        <header className="cashier-desktop-heading">
          <div>
            <h1 id="cashier-desk-title">Collect payments</h1>
            <p>Review open bills and collect payment at the counter.</p>
          </div>
          <button
            type="button"
            className="cashier-secondary"
            onClick={load}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </header>
        <div className="cashier-desktop-summary">
          <div>
            <Coins size={28} aria-hidden="true" />
            <div>
              <strong>{loading ? "—" : peso(toCollect)}</strong>
              <span>Total open balance at the counter</span>
            </div>
          </div>
          <div>
            <ReceiptText size={28} aria-hidden="true" />
            <div>
              <strong>
                {loading
                  ? "—"
                  : `${counterEntries.length} open ${counterEntries.length === 1 ? "bill" : "bills"}`}
              </strong>
              <span>
                {groups.requested.length
                  ? `${groups.requested.length} asked for the bill`
                  : "Tables, orders and booking deposits"}
              </span>
            </div>
          </div>
        </div>
        {notice && <Feedback tone="success">{notice}</Feedback>}
        {error && <Feedback onRetry={load}>{error}</Feedback>}
        <div className="cashier-desktop-workspace">
          <section
            className="cashier-desktop-queue"
            aria-labelledby="cashier-queue-title"
          >
            <h2 id="cashier-queue-title">
              Open bills{" "}
              {!loading && <span>{counter.length + deliveries.length}</span>}
            </h2>
            {search}
            {loading && <Skeleton cards={2} label="Loading bills to collect" />}
            {!loading &&
              rows.map(
                ({ key, label, Icon, entries }) =>
                  entries.length > 0 && (
                    <section
                      className="cashier-desktop-group"
                      key={key}
                      aria-label={label}
                    >
                      <h3>
                        <Icon size={16} aria-hidden="true" />
                        {label}
                        <span>{entries.length}</span>
                      </h3>
                      <DesktopBillRows
                        entries={entries}
                        active={inspected?.key}
                        onSelect={setInspectedKey}
                      />
                    </section>
                  ),
              )}
            {!loading && deliveries.length > 0 && (
              <details
                className="cashier-desktop-group cashier-desktop-delivery"
                open={deliveryOpen}
                onToggle={(event) => setDeliveryOpen(event.currentTarget.open)}
              >
                <summary>
                  <Truck size={16} aria-hidden="true" />
                  Delivery orders <span>{deliveries.length}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <p>Collect here only if the guest pays at the counter.</p>
                <DesktopBillRows
                  entries={deliveries}
                  active={inspected?.key}
                  onSelect={setInspectedKey}
                />
              </details>
            )}
            {!loading && !error && !counter.length && !deliveries.length && (
              <EmptyState
                compact
                icon={Wallet}
                title={
                  query ? "No bills match" : "Nothing to collect right now"
                }
                description={
                  query
                    ? "Try a table number, order number or name."
                    : "Balances appear here when they are due."
                }
              />
            )}
          </section>
          {inspected ? (
            <DesktopBillInspector
              key={inspected.key}
              entry={inspected}
              refreshing={refreshing}
              onRefresh={load}
              onCollect={(method) => {
                setNotice("");
                setInitialMethod(method);
                setSelected(inspected);
              }}
            />
          ) : (
            <section
              className="cashier-desktop-inspector"
              aria-label="Bill details"
            >
              <EmptyState
                icon={ReceiptText}
                title={loading ? "Loading bill details" : "Select a bill"}
                description="The itemized bill and payment options appear here."
              />
            </section>
          )}
        </div>
        {collection}
      </section>
    );
  }
  return (
    <section className="cashier-desk" aria-labelledby="cashier-desk-title">
      <h1 id="cashier-desk-title" className="sr-only">
        Collect payments
      </h1>
      <div className="cashier-desk-summary">
        <div>
          <small>To collect at the counter</small>
          <strong>{loading ? "—" : peso(toCollect)}</strong>
          <span>
            {loading
              ? "Loading…"
              : `${counterEntries.length} ${counterEntries.length === 1 ? "bill" : "bills"} waiting`}
          </span>
        </div>
        {groups.requested.length > 0 && (
          <span className="cashier-desk-alert">
            <BellRing size={15} aria-hidden="true" />
            {groups.requested.length} asked for the bill
          </span>
        )}
        {phone && !loading && (
          <div
            className="cashier-split-chips"
            role="group"
            aria-label="Show bills from"
          >
            {[
              ["tables", "Tables", tablesTotal],
              ["counter", "Counter", counterTotal],
            ].map(([value, text, total]) => (
              <button
                key={value}
                type="button"
                aria-pressed={only === value}
                onClick={() =>
                  setOnly((current) => (current === value ? "" : value))
                }
              >
                <span>{text}</span>
                <b>{peso(total)}</b>
              </button>
            ))}
          </div>
        )}
      </div>
      {search}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {loading && <Skeleton cards={2} label="Loading bills to collect" />}
      {!loading &&
        GROUPS.map(([key, label, Icon]) => {
          const entries = visible(key);
          if (!entries.length) return null;
          return (
            <section
              key={key}
              className="cashier-group"
              data-group={key}
              aria-label={label}
            >
              <h2>
                <Icon size={15} aria-hidden="true" />
                {label}
                <span>{entries.length}</span>
              </h2>
              <ul>
                {entries.map((entry) => (
                  <PhoneQueueRow
                    key={entry.key}
                    entry={entry}
                    refreshing={refreshing}
                    onCollect={() => {
                      setNotice("");
                      setSelected(entry);
                    }}
                    onCheck={load}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      {!loading && !error && shown === 0 && (
        <EmptyState
          compact
          icon={Wallet}
          title={query ? "No bills match" : "Nothing to collect right now"}
          description={
            query
              ? "Try a table number, an order number or a name."
              : "Table bills and counter orders appear here as soon as they are due."
          }
        />
      )}
      {!loading && !(phone && only) && visible("delivery").length > 0 && (
        <details
          className="cashier-group cashier-group--delivery"
          open={deliveryOpen}
          onToggle={(event) => setDeliveryOpen(event.currentTarget.open)}
        >
          <summary>
            <Truck size={15} aria-hidden="true" />
            Delivery orders
            <span>{visible("delivery").length}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          {deliveryOpen && (
            <>
              <p>
                Usually paid online or to the rider. Collect here only if the
                customer pays at the counter.
              </p>
              <ul>
                {visible("delivery").map((entry) => (
                  <PhoneQueueRow
                    key={entry.key}
                    entry={entry}
                    refreshing={refreshing}
                    onCollect={() => setSelected(entry)}
                    onCheck={load}
                  />
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      {collection}
    </section>
  );
}

function queueIcon(entry) {
  return entry.kind === "session"
    ? Table2
    : entry.kind === "reservation"
      ? CalendarClock
      : entry.orderType === "delivery"
        ? Truck
        : ShoppingBag;
}

function DesktopBillRows({ entries, active, onSelect }) {
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.key}>
          <button
            type="button"
            aria-pressed={entry.key === active}
            onClick={() => onSelect(entry.key)}
          >
            <span>
              <strong>{entry.title}</strong>
              <small>{entry.detail}</small>
              {entry.paymentPending && <small>Online checkout open</small>}
            </span>
            <b>{peso(entry.balance)}</b>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DesktopBillInspector({ entry, refreshing, onRefresh, onCollect }) {
  const [result, setResult] = useState(null);
  const [method, setMethod] = useState("cash");
  const itemized = entry.kind !== "reservation";
  useEffect(() => {
    if (!itemized) return;
    const controller = new AbortController();
    api(billPath(entry), { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ entry, bill: data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ entry, error: error.message });
      });
    return () => controller.abort();
  }, [entry, itemized]);
  const bill = result?.bill;
  const error = result?.error;
  const ready = !itemized || (result?.entry === entry && bill && !error);
  const balance = bill?.balance_due ?? entry.balance;
  const Icon = queueIcon(entry);
  const opened =
    entry.kind === "session" && entry.since ? new Date(entry.since) : null;
  return (
    <section
      className="cashier-desktop-inspector"
      aria-labelledby="cashier-bill-title"
    >
      <header>
        <Icon size={24} aria-hidden="true" />
        <div>
          <h2 id="cashier-bill-title">{entry.title}</h2>
          <p>{entry.detail}</p>
        </div>
        {entry.requestedAt && (
          <span className="cashier-desk-alert">Bill requested</span>
        )}
        {!entry.requestedAt && opened && (
          <time className="cashier-desktop-opened" dateTime={entry.since}>
            Opened{" "}
            {opened.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        )}
      </header>
      {error && <Feedback onRetry={onRefresh}>{error}</Feedback>}
      {itemized && !bill && !error && (
        <Skeleton cards={1} label="Loading the bill" />
      )}
      {bill && <BillLines bill={bill} desktopTable />}
      <div className="cashier-due">
        <span>{itemized ? "Balance due" : "Deposit due"}</span>
        <strong>{peso(balance)}</strong>
      </div>
      {entry.paymentPending ? (
        <div className="cashier-desktop-pending">
          <p>
            Online checkout is open. Check its status before collecting another
            payment.
          </p>
          <button
            type="button"
            className="cashier-secondary"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Check status
          </button>
        </div>
      ) : (
        <>
          <fieldset className="cashier-desktop-methods">
            <legend>Payment method</legend>
            <label>
              <Wallet size={18} aria-hidden="true" />
              Cash
              <input
                type="radio"
                name="cashier-desktop-method"
                value="cash"
                checked={method === "cash"}
                onChange={() => setMethod("cash")}
              />
            </label>
            {itemized && (
              <label>
                <CreditCard size={18} aria-hidden="true" />
                Online checkout
                <input
                  type="radio"
                  name="cashier-desktop-method"
                  value="online"
                  checked={method === "online"}
                  onChange={() => setMethod("online")}
                />
              </label>
            )}
          </fieldset>
          <div className="cashier-actions">
            <button
              type="button"
              className="cashier-primary"
              onClick={() => onCollect(method)}
              disabled={!ready || refreshing || !(Number(balance) > 0)}
            >
              <CreditCard size={18} aria-hidden="true" />
              Collect payment
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PhoneQueueRow({ entry, onCollect, onCheck, refreshing }) {
  const Icon = queueIcon(entry);
  const urgent = isUrgent(entry);
  const tag = entry.requestedAt
    ? {
        text: `Bill requested ${waitingFor(entry.requestedAt)} ago`.replace(
          "just now ago",
          "just now",
        ),
        tone: "ready",
      }
    : counterTag(entry);
  const waited = waitingFor(entry.since);
  const detail = entry.kind === "order" ? entry.brief : entry.detail;
  const waitedText =
    waited &&
    (entry.kind === "session" ? `seated ${waited}` : `waiting ${waited}`);
  return (
    <li className="cashier-prow-item">
      <button
        type="button"
        className="cashier-prow"
        data-urgent={urgent || undefined}
        disabled={entry.paymentPending && refreshing}
        onClick={entry.paymentPending ? onCheck : onCollect}
        aria-label={
          entry.paymentPending
            ? `Check online payment for ${entry.title}`
            : `Collect ${peso(entry.balance)} for ${entry.title}`
        }
      >
        <span className="cashier-row-icon" aria-hidden="true">
          <Icon size={17} />
        </span>
        <span className="cashier-prow-main">
          <strong>{entry.title}</strong>
          <small>{detail}</small>
          <span className="cashier-prow-tags">
            {entry.paymentPending ? (
              <em className="cashier-tag" data-tone="neutral">
                Online checkout open · tap to check
              </em>
            ) : (
              tag && (
                <em className="cashier-tag" data-tone={tag.tone}>
                  {tag.text}
                </em>
              )
            )}
            {waitedText && !entry.requestedAt && (
              <span className="cashier-prow-wait">{waitedText}</span>
            )}
          </span>
        </span>
        <span className="cashier-prow-side">
          <b>{peso(entry.balance)}</b>
          {urgent && !entry.paymentPending ? (
            <span className="cashier-prow-collect">Collect</span>
          ) : (
            <ChevronRight size={18} aria-hidden="true" />
          )}
        </span>
      </button>
    </li>
  );
}

/** Itemised bill, Senior/PWD discount, cash with change or online, then a receipt. */
function CollectSheet({
  entry,
  onClose,
  onPaid,
  phone = false,
  initialMethod,
  canStillPay,
}) {
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  const [method, setMethod] = useState(initialMethod);
  const [split, setSplit] = useState(false);
  const [part, setPart] = useState("");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const sheet = useRef(null);
  const itemised = entry.kind !== "reservation";
  async function loadBill() {
    if (!itemised) return;
    try {
      const result = await api(billPath(entry));
      setBill(result.data);
    } catch (failure) {
      setError(failure.message);
    }
  }
  useEffect(() => {
    loadBill();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event) => event.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", escape);
    sheet.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const balance = itemised
    ? Number(bill?.balance_due ?? entry.balance)
    : entry.balance;
  const amount = split ? Math.min(Number(part) || 0, balance) : balance;
  const cash = Number(received) || 0;
  const change = Math.round((cash - amount) * 100) / 100;
  const available = phone || (canStillPay && (!itemised || Boolean(bill)));
  const canRecordCash = available && amount > 0 && cash >= amount && !busy;
  async function recordCash() {
    if (!canRecordCash) return;
    setBusy(true);
    setError("");
    try {
      const path =
        entry.kind === "session"
          ? `/dining-sessions/${entry.id}/payments/cash`
          : entry.kind === "reservation"
            ? `/reservations/${entry.id}/deposit/cash`
            : `/orders/${entry.id}/payments/cash`;
      const body =
        entry.kind === "reservation"
          ? undefined
          : JSON.stringify({ ...(split ? { amount } : {}), tendered: cash });
      const result = await api(path, {
        method: "POST",
        ...(body ? { body } : {}),
      });
      playSound("success");
      // Show the new balance straight away; the reload below confirms it.
      if (itemised)
        setBill((current) =>
          current
            ? {
                ...current,
                paid: Math.round((current.paid + amount) * 100) / 100,
                balance_due: Math.max(
                  0,
                  Math.round((current.balance_due - amount) * 100) / 100,
                ),
              }
            : current,
        );
      setReceipt({
        ...result.data,
        change: result.data.change ?? (cash - amount).toFixed(2),
        cash_tendered: result.data.cash_tendered ?? cash.toFixed(2),
      });
      onPaid(`Cash payment recorded for ${entry.title}.`);
      if (itemised) await loadBill();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function payOnline() {
    if (!available || busy || balance <= 0 || (!phone && split)) return;
    setBusy(true);
    setError("");
    try {
      const path =
        entry.kind === "session"
          ? `/dining-sessions/${entry.id}/payments/checkout`
          : `/orders/${entry.id}/payments/checkout`;
      const result = await api(path, { method: "POST" });
      const url = new URL(result.data.checkout_url);
      const local = ["localhost", "127.0.0.1"].includes(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
        throw new Error(
          "The checkout address could not be verified. Check the status before trying again.",
        );
      window.location.assign(url.href);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  function printReceipt() {
    printThermalReceipt();
  }
  const remaining = itemised ? Number(bill?.balance_due ?? 0) : 0;
  const cashButton = (
    <button
      type="button"
      className="cashier-primary"
      disabled={!canRecordCash}
      onClick={recordCash}
    >
      <Check size={17} aria-hidden="true" />
      {busy ? "Recording…" : `Record ${peso(amount)} cash`}
    </button>
  );
  const onlineButton = (
    <button
      type="button"
      className="cashier-primary"
      disabled={!available || busy || balance <= 0 || (!phone && split)}
      onClick={payOnline}
    >
      <CreditCard size={17} aria-hidden="true" />
      {busy ? "Opening checkout…" : `Open checkout for ${peso(balance)}`}
    </button>
  );
  return (
    <div className="cashier-sheet-layer">
      <div
        className="cashier-sheet-scrim"
        aria-hidden="true"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={sheet}
        className="cashier-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashier-sheet-title"
        tabIndex={-1}
      >
        <header className="cashier-sheet-head">
          <div>
            <small>
              {entry.kind === "session"
                ? `Table bill${bill?.guest_count ? ` · ${bill.guest_count} guests` : ""}`
                : entry.kind === "reservation"
                  ? "Booking deposit"
                  : entry.detail}
            </small>
            <h2 id="cashier-sheet-title">
              {entry.kind === "session" && bill?.table_number
                ? tableLabel(bill.table_number)
                : entry.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="cashier-sheet-body">
          {error && <Feedback>{error}</Feedback>}
          {receipt ? (
            <Receipt
              receipt={receipt}
              title={entry.title}
              remaining={remaining}
              onPrint={printReceipt}
              onCollectRest={() => {
                setReceipt(null);
                setSplit(false);
                setPart("");
                setReceived("");
              }}
            />
          ) : (
            <>
              {!phone && !canStillPay && (
                <Feedback>
                  This bill has changed. Close this review to check its current
                  status.
                </Feedback>
              )}
              {itemised && !bill && !error && (
                <Skeleton cards={1} label="Loading the bill" />
              )}
              {bill && <BillLines bill={bill} compact={phone} />}
              {bill && (
                <DiscountPanel
                  bill={bill}
                  entry={entry}
                  open={discountOpen}
                  setOpen={setDiscountOpen}
                  onChanged={setBill}
                />
              )}
              <section className="cashier-pay" aria-label="Payment">
                <div className="cashier-due">
                  <span>Balance due</span>
                  <strong>{peso(balance)}</strong>
                </div>
                {entry.kind !== "reservation" && (
                  <label
                    className="cashier-split"
                    data-switch={phone || undefined}
                  >
                    <input
                      type="checkbox"
                      role={phone ? "switch" : undefined}
                      checked={split}
                      onChange={(event) => {
                        setSplit(event.target.checked);
                        setPart("");
                        if (!phone && event.target.checked) setMethod("cash");
                      }}
                    />
                    Pay part now (split the bill)
                  </label>
                )}
                {split && (
                  <label className="cashier-field">
                    Amount for this payment
                    <input
                      inputMode="decimal"
                      value={part}
                      placeholder="0.00"
                      onChange={(event) =>
                        setPart(event.target.value.replace(/[^\d.]/g, ""))
                      }
                    />
                  </label>
                )}
                {entry.kind !== "reservation" && (
                  <div
                    className="cashier-method"
                    role="group"
                    aria-label="Payment method"
                  >
                    <button
                      type="button"
                      aria-pressed={method === "cash"}
                      onClick={() => setMethod("cash")}
                    >
                      <Wallet size={16} aria-hidden="true" />
                      Cash
                    </button>
                    <button
                      type="button"
                      aria-pressed={method === "online"}
                      onClick={() => setMethod("online")}
                      disabled={split}
                      title={
                        split
                          ? "Online checkout charges the full remaining balance."
                          : undefined
                      }
                    >
                      <CreditCard size={16} aria-hidden="true" />
                      Card / GCash
                    </button>
                  </div>
                )}
                {method === "cash" || entry.kind === "reservation" ? (
                  <>
                    <label className="cashier-field">
                      Cash received
                      <input
                        inputMode="decimal"
                        value={received}
                        placeholder="0.00"
                        onChange={(event) =>
                          setReceived(event.target.value.replace(/[^\d.]/g, ""))
                        }
                      />
                    </label>
                    <div className="cashier-quick" aria-label="Quick amounts">
                      {quickCashAmounts(amount).map((value, index) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setReceived(String(value))}
                        >
                          {index === 0
                            ? "Exact"
                            : peso(value).replace(".00", "")}
                        </button>
                      ))}
                    </div>
                    {(!phone || cash > 0) && (
                      <div
                        className="cashier-change"
                        data-short={cash > 0 && change < 0 ? true : undefined}
                        data-ok={
                          phone && cash > 0 && change >= 0 ? true : undefined
                        }
                      >
                        <span>
                          {change < 0
                            ? phone
                              ? "Short"
                              : "Still short"
                            : "Change"}
                        </span>
                        <strong>
                          {cash > 0 ? peso(Math.abs(change)) : "—"}
                        </strong>
                      </div>
                    )}
                    {!phone && (
                      <div className="cashier-actions">{cashButton}</div>
                    )}
                  </>
                ) : (
                  <div className="cashier-actions">
                    <p>
                      The guest pays on the secure checkout page (card, GCash or
                      QR Ph).
                    </p>
                    {!phone && onlineButton}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
        {/* Phones: the pay button stays in reach at the bottom of the sheet. */}
        {phone && !receipt && (
          <footer className="cashier-sheet-foot">
            {method === "cash" || entry.kind === "reservation"
              ? cashButton
              : onlineButton}
          </footer>
        )}
      </div>
    </div>
  );
}

function itemOptions(item) {
  return [item.variant, ...(item.addons || []).map((addon) => `+ ${addon}`)]
    .filter(Boolean)
    .join(" · ");
}

function BillLines({ bill, compact = false, desktopTable = false }) {
  const rows = [
    ["Subtotal", bill.subtotal],
    bill.item_discounts > 0 && ["Item discounts", -bill.item_discounts],
    bill.service_charge > 0 && ["Service charge", bill.service_charge],
    bill.delivery_fee > 0 && ["Delivery fee", bill.delivery_fee],
    bill.tax > 0 && ["Tax", bill.tax],
    bill.special_discount > 0 && [
      `${bill.discount?.type === "pwd" ? "PWD" : "Senior Citizen"} discount`,
      -bill.special_discount,
    ],
    ["Total", bill.total, "total"],
    bill.paid > 0 && ["Paid so far", -bill.paid],
  ].filter(Boolean);
  const plain = rows.every(
    ([label]) => label === "Subtotal" || label === "Total",
  );
  return (
    <section
      className="cashier-bill"
      aria-label="Bill"
      data-compact={compact || undefined}
    >
      {desktopTable ? (
        <table
          className="cashier-desktop-lines"
          aria-label="Items on this bill"
        >
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Qty</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          {bill.orders.map((order) => (
            <tbody key={order.id}>
              {bill.orders.length > 1 && (
                <tr className="cashier-desktop-order-number">
                  <th scope="rowgroup" colSpan={3}>
                    {order.order_number}
                  </th>
                </tr>
              )}
              {order.items.map((item, index) => (
                <tr key={index}>
                  <td>
                    {item.name}
                    {itemOptions(item) && <small>{itemOptions(item)}</small>}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{peso(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      ) : (
        bill.orders.map((order) => (
          <div key={order.id} className="cashier-bill-order">
            {bill.orders.length > 1 && (
              <h3>
                {order.order_number}
                <span>{order.status.replaceAll("_", " ")}</span>
              </h3>
            )}
            <ul>
              {order.items.map((item, index) => (
                <li key={index}>
                  <span className="cashier-bill-qty">{item.quantity}×</span>
                  <span className="cashier-bill-name">
                    {item.name}
                    {(item.variant || item.addons?.length > 0) && (
                      <small>{itemOptions(item)}</small>
                    )}
                  </span>
                  <span className="cashier-bill-amount">
                    {peso(item.line_total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {!(compact && plain) && (
        <dl className="cashier-bill-totals">
          {rows.map(([label, value, kind]) => (
            <div key={label} data-kind={kind}>
              <dt>{label}</dt>
              <dd>{value < 0 ? `−${peso(-value)}` : peso(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function DiscountPanel({ bill, entry, open, setOpen, onChanged }) {
  const [type, setType] = useState("senior");
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [eligible, setEligible] = useState(1);
  const [guests, setGuests] = useState(bill.guest_count || 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target =
    entry.kind === "session"
      ? { session_id: entry.id }
      : { order_id: entry.id };
  async function apply(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/cashier/discount", {
        method: "POST",
        body: JSON.stringify({
          ...target,
          type,
          name,
          id_number: idNumber,
          eligible_guests: Number(eligible),
          total_guests: Number(guests),
        }),
      });
      onChanged(result.data);
      setOpen(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/cashier/discount", {
        method: "DELETE",
        body: JSON.stringify(target),
      });
      onChanged(result.data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  if (bill.discount)
    return (
      <div className="cashier-discount-applied">
        <UserRoundCheck size={17} aria-hidden="true" />
        <span>
          <strong>
            {bill.discount.type === "pwd" ? "PWD" : "Senior Citizen"} discount
          </strong>
          <small>
            {bill.discount.name} · ID {bill.discount.id_number}
          </small>
        </span>
        {bill.can_discount && (
          <button
            type="button"
            className="ui-button ui-button--danger"
            onClick={remove}
            disabled={busy}
          >
            Remove
          </button>
        )}
      </div>
    );
  if (!bill.can_discount) return null;
  return (
    <section className="cashier-discount">
      {error && <Feedback>{error}</Feedback>}
      {!open ? (
        <button
          type="button"
          className="cashier-discount-open"
          onClick={() => setOpen(true)}
        >
          <UserRoundCheck size={16} aria-hidden="true" />
          Senior Citizen / PWD discount
        </button>
      ) : (
        <form onSubmit={apply}>
          <div
            className="cashier-method"
            role="group"
            aria-label="Discount type"
          >
            <button
              type="button"
              aria-pressed={type === "senior"}
              onClick={() => setType("senior")}
            >
              Senior Citizen
            </button>
            <button
              type="button"
              aria-pressed={type === "pwd"}
              onClick={() => setType("pwd")}
            >
              PWD
            </button>
          </div>
          <label className="cashier-field">
            Name on the ID
            <input
              value={name}
              required
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="cashier-field">
            ID number
            <input
              value={idNumber}
              required
              maxLength={40}
              onChange={(event) => setIdNumber(event.target.value)}
            />
          </label>
          <div className="cashier-field-row">
            <label className="cashier-field">
              Qualifying guests
              <input
                type="number"
                min="1"
                max={guests}
                value={eligible}
                onChange={(event) => setEligible(event.target.value)}
              />
            </label>
            <label className="cashier-field">
              Guests sharing
              <input
                type="number"
                min="1"
                max="50"
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
              />
            </label>
          </div>
          <p className="cashier-hint">
            20% off their share, VAT-exempt. The ID is kept with the payment
            record.
          </p>
          <div className="cashier-actions">
            <button
              type="button"
              className="cashier-secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="cashier-primary" disabled={busy}>
              {busy ? "Applying…" : "Apply discount"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Receipt({ receipt, title, remaining, onPrint, onCollectRest }) {
  const paidAt = receipt.paid_at ? new Date(receipt.paid_at) : new Date();
  return (
    <section className="cashier-receipt" aria-label="Receipt">
      <ThermalReceipt receipt={receipt} />
      <div className="cashier-receipt-done">
        <span aria-hidden="true">
          <Check size={22} />
        </span>
        <strong>Paid {peso(receipt.amount)}</strong>
        {Number(receipt.change) > 0 && (
          <p className="cashier-receipt-change">
            Change <b>{peso(receipt.change)}</b>
          </p>
        )}
      </div>
      <dl>
        <div>
          <dt>For</dt>
          <dd>
            {receipt.table
              ? tableLabel(receipt.table)
              : receipt.order_number || receipt.reservation_reference || title}
          </dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>{receipt.reference}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>
            {String(receipt.method || "cash").replace(/^./, (l) =>
              l.toUpperCase(),
            )}
          </dd>
        </div>
        {receipt.cash_tendered && (
          <div>
            <dt>Cash received</dt>
            <dd>{peso(receipt.cash_tendered)}</dd>
          </div>
        )}
        {receipt.cash_tendered && (
          <div>
            <dt>Change</dt>
            <dd>{peso(receipt.change)}</dd>
          </div>
        )}
        <div>
          <dt>Time</dt>
          <dd>
            {paidAt.toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </dd>
        </div>
        {receipt.received_by && (
          <div>
            <dt>Received by</dt>
            <dd>{receipt.received_by}</dd>
          </div>
        )}
      </dl>
      {remaining > 0 && (
        <p className="cashier-receipt-remaining">
          {peso(remaining)} still due on this bill.
        </p>
      )}
      <div className="cashier-actions">
        <button type="button" className="cashier-secondary" onClick={onPrint}>
          <Printer size={16} aria-hidden="true" />
          Print receipt
        </button>
        {remaining > 0 && (
          <button
            type="button"
            className="cashier-primary"
            onClick={onCollectRest}
          >
            Collect the rest
          </button>
        )}
      </div>
    </section>
  );
}
