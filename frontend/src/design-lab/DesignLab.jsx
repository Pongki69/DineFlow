// @ts-check
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  Bell,
  Bike,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  LayoutDashboard,
  Leaf,
  MapPin,
  Menu,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Sun,
  Table2,
  TriangleAlert,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  MOCK_MENU_ITEMS,
  MOCK_ORDERS,
  MOCK_RESTAURANT_INFO,
  MOCK_TABLES,
  MOCK_USERS,
} from "../mocks/productionTestData";
import {
  Drawer,
  Pagination,
  ResponsiveDataTable,
  StatePanel,
  StatusBadge,
} from "./components";
import {
  decimal,
  money,
  orderDataset,
  previewRole,
  ROLE_LAYOUTS,
} from "./model";

/** @typedef {import('./types').MockOrder} MockOrder */
/** @typedef {import('./types').MockMenuItem} MockMenuItem */
/** @typedef {import('./model').PreviewRole} PreviewRole */
/** @typedef {'ready'|'loading'|'empty'|'error'} DemoState */
/** @typedef {{item: MockMenuItem, variant: string, addons: string[], unitPrice: number}} CartLine */

/** @param {import('react').ButtonHTMLAttributes<HTMLButtonElement> & {secondary?:boolean}} props */
function Action({ children, secondary = false, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`df-action ${secondary ? "df-action--secondary" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** @param {{title:string, kicker?:string, children:import('react').ReactNode, action?:import('react').ReactNode, className?:string}} props */
function Panel({ title, kicker, children, action, className = "" }) {
  return (
    <section className={`df-panel ${className}`} aria-label={title}>
      <header className="df-panel-heading">
        <div>
          {kicker && <p className="df-kicker">{kicker}</p>}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** @param {{label:string, value:string, hint:string, warning?:boolean}} props */
function Metric({ label, value, hint, warning = false }) {
  return (
    <article className={`df-metric ${warning ? "df-metric--warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

/** @param {{item:MockMenuItem, hero?:boolean}} props */
function DishPhoto({ item, hero = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`df-food-photo ${hero ? "df-food-photo--hero" : ""}`}>
      {failed ? (
        <div className="df-photo-fallback">
          <UtensilsCrossed size={42} aria-hidden="true" />
          <span>{item.name}</span>
        </div>
      ) : (
        <img
          src={item.image}
          alt={item.name}
          width="600"
          height="440"
          loading={hero ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/** This is deliberately a diagram: fixtures contain no coordinates or GPS observations. @param {{onExpand?:()=>void}} props */
function CoverageMap({ onExpand }) {
  const titleId = useId();
  return (
    <div className="df-map">
      <svg viewBox="0 0 720 360" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          Illustrative coverage diagram: restaurant, Carlos Rossi, and delivery
          destination. These are not live locations.
        </title>
        <rect width="720" height="360" fill="var(--df-map-ground)" />
        <path
          d="M0 250 Q130 200 230 250 T460 250 T720 220 V360 H0Z"
          fill="var(--df-map-water)"
        />
        <g fill="var(--df-map-park)">
          <rect x="36" y="28" width="160" height="96" rx="20" />
          <rect x="490" y="52" width="190" height="72" rx="16" />
          <rect x="456" y="278" width="150" height="70" rx="16" />
        </g>
        <g stroke="var(--df-map-road)" strokeWidth="14" fill="none">
          <path d="M0 154H720M260 0V360M424 0V360M0 310L720 58M88 0L654 360" />
        </g>
        <circle
          cx="350"
          cy="176"
          r="132"
          fill="var(--df-map-coverage)"
          stroke="var(--df-color-brand)"
          strokeDasharray="7 7"
          strokeWidth="2"
        />
        <path
          d="M350 176L425 152L505 126"
          fill="none"
          stroke="var(--df-color-brand)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <g
          fill="var(--df-color-text, var(--df-color-ink))"
          fontFamily="system-ui"
          fontSize="14"
        >
          <text x="48" y="78">
            Garden district
          </text>
          <text x="525" y="94">
            East market
          </text>
          <text x="80" y="330">
            Riverside
          </text>
        </g>
        <g>
          <circle cx="350" cy="176" r="24" fill="var(--df-color-brand)" />
          <text
            x="350"
            y="182"
            textAnchor="middle"
            fill="var(--df-color-on-brand)"
            fontSize="18"
            fontWeight="600"
          >
            D
          </text>
          <circle
            cx="425"
            cy="152"
            r="17"
            fill="var(--df-status-progress-text)"
          />
          <text
            x="425"
            y="158"
            textAnchor="middle"
            fill="var(--df-status-progress-bg)"
            fontSize="15"
            fontWeight="600"
          >
            C
          </text>
          <circle
            cx="505"
            cy="126"
            r="17"
            fill="var(--df-status-pending-text)"
          />
          <text
            x="505"
            y="132"
            textAnchor="middle"
            fill="var(--df-status-pending-bg)"
            fontSize="15"
            fontWeight="600"
          >
            1
          </text>
        </g>
      </svg>
      {onExpand && (
        <button
          className="df-map-expand df-icon-button"
          aria-label="Expand coverage diagram"
          onClick={onExpand}
        >
          <ArrowDownRight size={20} aria-hidden="true" />
        </button>
      )}
      <div className="df-map-legend">
        <span>
          <Store size={15} aria-hidden="true" />
          Restaurant
        </span>
        <span>
          <Bike size={15} aria-hidden="true" />
          Carlos Rossi
        </span>
        <span>Illustrative · not live GPS</span>
      </div>
    </div>
  );
}

/** @param {{orders:MockOrder[], onView:(order:MockOrder)=>void, state:DemoState, onRetry:()=>void}} props */
function OrderList({ orders, onView, state, onRetry }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(2);
  const rows = useMemo(
    () =>
      state === "empty"
        ? []
        : orders.filter(
            (order) =>
              `${order.id} ${order.customerName} ${order.tableNumber || ""}`
                .toLowerCase()
                .includes(query.toLowerCase()) &&
              (status === "all" || order.status === status) &&
              (payment === "all" ||
                (payment === "unpaid"
                  ? order.paymentStatus === "Unpaid"
                  : order.paymentStatus.startsWith("Paid"))),
          ),
    [orders, query, status, payment, state],
  );
  const safePage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  const searchId = useId();
  return (
    <Panel
      title="Orders in focus"
      kicker="Service queue"
      action={<span className="df-count">{rows.length} orders</span>}
    >
      <div className="df-filter-bar">
        <label className="df-search" htmlFor={searchId}>
          <Search size={18} aria-hidden="true" />
          <span className="df-sr-only">Search orders</span>
          <input
            id={searchId}
            value={query}
            placeholder="Order, guest or table"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="df-select-field">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {["Preparing", "Delayed", "Ready", "Served"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <details className="df-more-filters">
          <summary>
            <SlidersHorizontal size={16} aria-hidden="true" />
            More filters
          </summary>
          <label className="df-select-field">
            <span>Payment</span>
            <select
              value={payment}
              onChange={(event) => {
                setPayment(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All payment states</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </label>
        </details>
      </div>
      <ResponsiveDataTable
        orders={rows.slice((safePage - 1) * pageSize, safePage * pageSize)}
        onView={onView}
        loading={state === "loading"}
        error={
          state === "error"
            ? "We couldn’t load the queue. Your draft actions are safe."
            : null
        }
        onRetry={onRetry}
      />
      {state !== "error" && state !== "loading" && (
        <Pagination
          page={safePage}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </Panel>
  );
}

/** @param {{onExpand:()=>void}} props */
function FleetPanel({ onExpand }) {
  return (
    <Panel
      title="Delivery coverage"
      kicker="Live operations · fixture preview"
      action={<StatusBadge status="Delayed" />}
    >
      <CoverageMap onExpand={onExpand} />
      <div className="df-inline-callout">
        <TriangleAlert size={20} aria-hidden="true" />
        <div>
          <strong>One delivery needs attention</strong>
          <p>ord_1002 · Sophia Martinez · 41 min elapsed</p>
        </div>
      </div>
    </Panel>
  );
}

/** @param {{orders:MockOrder[], onView:(order:MockOrder)=>void, state:DemoState, onRetry:()=>void, onExpand:()=>void, manager?:boolean}} props */
function OperationsView({
  orders,
  onView,
  state,
  onRetry,
  onExpand,
  manager = false,
}) {
  const unpaid = orders.filter((order) => order.paymentStatus === "Unpaid");
  return (
    <>
      <div className="df-metrics">
        <Metric
          label="Active orders"
          value={String(orders.length)}
          hint="Supplied order fixtures"
        />
        <Metric
          label="Needs attention"
          value={String(
            orders.filter((order) => order.status === "Delayed").length,
          )}
          hint="Delayed delivery"
          warning
        />
        <Metric
          label={manager ? "Occupied tables" : "Available riders"}
          value={manager ? "2 / 6" : "1"}
          hint={
            manager ? "Main dining & VIP lounge" : "One sample rider online"
          }
        />
        <Metric
          label="Unpaid balance"
          value={money(unpaid.reduce((total, order) => total + order.total, 0))}
          hint="Orders awaiting settlement"
        />
      </div>
      <div className="df-overview-grid">
        <FleetPanel onExpand={onExpand} />
        <Panel
          title={manager ? "Dining room" : "Service pulse"}
          kicker="At a glance"
        >
          <div className="df-pulse">
            <div>
              <Table2 size={20} aria-hidden="true" />
              <span>Tables occupied</span>
              <strong>2 of 6</strong>
            </div>
            <div>
              <Clock3 size={20} aria-hidden="true" />
              <span>Longest running table</span>
              <strong>85 min</strong>
            </div>
            <div>
              <Users size={20} aria-hidden="true" />
              <span>Guests at occupied tables</span>
              <strong>10</strong>
            </div>
          </div>
          <div className="df-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>
              {manager
                ? "Staff access and restricted business policies stay outside this role."
                : "Exceptions appear before routine activity. Detailed tools stay one step away."}
            </p>
          </div>
        </Panel>
      </div>
      <OrderList
        orders={orders}
        onView={onView}
        state={state}
        onRetry={onRetry}
      />
    </>
  );
}

/** @param {{onView:(order:MockOrder)=>void, onReconcile:()=>void, state:DemoState, onRetry:()=>void}} props */
function CashierView({ onView, onReconcile, state, onRetry }) {
  const due = MOCK_ORDERS.filter((order) => order.paymentStatus === "Unpaid");
  return (
    <>
      <div className="df-metrics df-metrics--three">
        <Metric
          label="Outstanding bills"
          value={String(due.length)}
          hint="Dine-in tables waiting"
        />
        <Metric
          label="Balance due"
          value={money(due.reduce((sum, order) => sum + order.total, 0))}
          hint="Supplied fixture totals"
        />
        <Metric
          label="Paid orders"
          value="2"
          hint="One cash · one hosted payment"
        />
      </div>
      <div className="df-cashier-grid">
        <Panel title="Ready to settle" kicker="Payment queue">
          <StateContent state={state} onRetry={onRetry}>
            {due.map((order) => (
              <article className="df-bill" key={order.id}>
                <div className="df-bill-top">
                  <span className="df-table-avatar">
                    <Table2 size={23} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{order.tableNumber}</h3>
                    <p>{order.customerName}</p>
                  </div>
                  <StatusBadge status="Unpaid" />
                </div>
                <dl className="df-totals">
                  <div>
                    <dt>Items</dt>
                    <dd>{money(order.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>Service charge</dt>
                    <dd>{money(order.serviceCharge || 0)}</dd>
                  </div>
                  <div>
                    <dt>Tax</dt>
                    <dd>{money(order.tax)}</dd>
                  </div>
                  <div className="df-grand-total">
                    <dt>Amount due</dt>
                    <dd>{money(order.total)}</dd>
                  </div>
                </dl>
                <Action onClick={() => onView(order)}>
                  Review bill <ArrowRight size={18} aria-hidden="true" />
                </Action>
              </article>
            ))}
          </StateContent>
        </Panel>
        <Panel title="Drawer review" kicker="Proposed workflow">
          <CreditCard
            className="df-feature-icon"
            size={32}
            aria-hidden="true"
          />
          <h3>Close your shift with clarity.</h3>
          <p>
            Compare expected cash with a counted amount before submitting a
            reconciliation.
          </p>
          <p className="df-caption">
            This is a proposed local interaction; the current app has no
            shift-ledger service.
          </p>
          <Action secondary onClick={onReconcile}>
            Preview reconciliation
          </Action>
        </Panel>
      </div>
    </>
  );
}

/** @param {{state:DemoState, onRetry:()=>void, children:import('react').ReactNode}} props */
function StateContent({ state, onRetry, children }) {
  if (state !== "ready")
    return (
      <StatePanel
        state={state}
        title={
          state === "empty"
            ? "All caught up"
            : state === "error"
              ? "The queue is unavailable"
              : "Loading your workspace"
        }
        description={
          state === "empty"
            ? "New activity will appear here."
            : "Sample state for design review."
        }
        onRetry={onRetry}
      />
    );
  return <>{children}</>;
}

/** @param {{state:DemoState, onRetry:()=>void, onNotice:(message:string)=>void}} props */
function KitchenView({ state, onRetry, onNotice }) {
  const [tickets, setTickets] = useState(
    MOCK_ORDERS.filter((order) => order.status !== "Served"),
  );
  return (
    <>
      <div className="df-kitchen-summary">
        <span>
          <Clock3 size={20} aria-hidden="true" />
          Oldest ticket · 41 min
        </span>
        <span>
          {tickets.filter((ticket) => ticket.status === "Ready").length} ready
        </span>
        <span>Visual priority + explicit labels</span>
      </div>
      <StateContent state={state} onRetry={onRetry}>
        <div className="df-kitchen-grid">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className={`df-ticket ${ticket.status === "Delayed" ? "df-ticket--urgent" : ""}`}
            >
              <div className="df-ticket-top">
                <span>
                  {ticket.orderType} ·{" "}
                  {ticket.tableNumber || ticket.customerName}
                </span>
                <strong>{ticket.elapsedMinutes} min</strong>
              </div>
              <div className="df-ticket-heading">
                <h2>{ticket.id}</h2>
                <StatusBadge status={ticket.status} />
              </div>
              <ul className="df-ticket-items">
                {ticket.items.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span className="df-quantity">{item.qty}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.variant}</p>
                      {item.addOns.length > 0 && (
                        <p className="df-item-note">
                          + {item.addOns.join(", ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="df-ticket-action">
                {ticket.status === "Ready" ? (
                  <p>
                    <Check size={18} aria-hidden="true" />
                    Ready for handoff
                  </p>
                ) : (
                  <Action
                    onClick={() => {
                      setTickets((current) =>
                        current.map((order) =>
                          order.id === ticket.id
                            ? { ...order, status: "Ready" }
                            : order,
                        ),
                      );
                      onNotice(`${ticket.id} marked ready in this preview.`);
                    }}
                  >
                    Mark ready <Check size={18} aria-hidden="true" />
                  </Action>
                )}
              </div>
            </article>
          ))}
        </div>
      </StateContent>
      <p className="df-caption">
        Delayed is a fixture presentation label; the production order status
        remains separate from delivery lateness.
      </p>
    </>
  );
}

/** @param {{state:DemoState, onRetry:()=>void, onOrder:()=>void}} props */
function WaiterView({ state, onRetry, onOrder }) {
  const [zone, setZone] = useState("All areas");
  return (
    <>
      <div className="df-section-toolbar">
        <div className="df-chips" aria-label="Filter dining area">
          {["All areas", "Main Dining", "Patio", "VIP Lounge"].map((value) => (
            <button
              key={value}
              aria-pressed={zone === value}
              onClick={() => setZone(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <Action onClick={onOrder}>
          <Plus size={18} aria-hidden="true" />
          New table order
        </Action>
      </div>
      <StateContent state={state} onRetry={onRetry}>
        <div className="df-table-grid">
          {MOCK_TABLES.filter(
            (table) => zone === "All areas" || table.zone === zone,
          ).map((table) => (
            <article className="df-dining-table" key={table.id}>
              <div className="df-dining-top">
                <Table2 size={28} aria-hidden="true" />
                <StatusBadge status={table.status} />
              </div>
              <h2>{table.tableNumber}</h2>
              <p>
                {table.zone} · {table.seats} seats
              </p>
              <div className="df-table-detail">
                {table.status === "Occupied"
                  ? `${table.guestCount} guests · ${table.elapsedMins} min seated`
                  : table.status === "Reserved"
                    ? `${table.reservationName} · ${table.reservationTime}`
                    : table.status === "Cleaning"
                      ? `Estimated ready in ${table.estReadyInMins} min`
                      : "Ready for your next guests"}
              </div>
            </article>
          ))}
        </div>
      </StateContent>
      <div className="df-note">
        <Table2 size={20} aria-hidden="true" />
        <p>
          Occupancy stays visible without opening a table. Order entry is a
          proposed staff flow; the live app needs customer/session attribution
          before rollout.
        </p>
      </div>
    </>
  );
}

/** @param {{state:DemoState,onRetry:()=>void,onExpand:()=>void,onNotice:(message:string)=>void}} props */
function RiderView({ state, onRetry, onExpand, onNotice }) {
  const [online, setOnline] = useState(true);
  const [stage, setStage] = useState(0);
  const stages = [
    "Arrive at restaurant",
    "Confirm pickup",
    "Start delivery",
    "Review delivery proof",
  ];
  return (
    <>
      <div className="df-rider-presence">
        <div>
          <span
            className={`df-presence-dot ${online ? "" : "df-presence-dot--offline"}`}
          />
          <div>
            <strong>{online ? "Online for sample offers" : "Offline"}</strong>
            <p>GPS is simulated · no location requested</p>
          </div>
        </div>
        <button
          className="df-switch"
          role="switch"
          aria-checked={online}
          aria-label="Rider online status"
          onClick={() => setOnline(!online)}
        >
          <span />
        </button>
      </div>
      <StateContent state={state} onRetry={onRetry}>
        <div className="df-rider-grid">
          <Panel title="Your current delivery" kicker="ord_1002 · Carlos Rossi">
            <div className="df-route-stops">
              <div>
                <span>1</span>
                <div>
                  <small>Pick up from</small>
                  <strong>{MOCK_RESTAURANT_INFO.name}</strong>
                  <p>{MOCK_RESTAURANT_INFO.address}</p>
                </div>
              </div>
              <div>
                <span>2</span>
                <div>
                  <small>Deliver to</small>
                  <strong>Sophia Martinez</strong>
                  <p>742 Evergreen Terrace, Apt 4B</p>
                </div>
              </div>
            </div>
            <div className="df-delivery-meta">
              <StatusBadge status="Delayed" />
              <span>Paid online · {money(102.2)}</span>
            </div>
            <ol className="df-progress-steps" aria-label="Delivery progress">
              {["Restaurant", "Pickup", "Transit", "Proof"].map(
                (step, index) => (
                  <li
                    key={step}
                    aria-current={stage === index ? "step" : undefined}
                    data-complete={index < stage}
                  >
                    {index < stage ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                    <span>{step}</span>
                  </li>
                ),
              )}
            </ol>
            <div className="df-rider-action-dock">
              <Action
                className="df-thumb-action"
                onClick={() => {
                  if (stage < 3) setStage(stage + 1);
                  onNotice(
                    stage < 3
                      ? `${stages[stage]} simulated. Production checks kitchen readiness and assignment ownership.`
                      : "Proof upload belongs to the production delivery flow; no delivery was completed.",
                  );
                }}
              >
                {stages[stage]}
                <ArrowRight size={18} aria-hidden="true" />
              </Action>
            </div>
          </Panel>
          <FleetPanel onExpand={onExpand} />
        </div>
      </StateContent>
      <div className="df-note">
        <MapPin size={20} aria-hidden="true" />
        <p>
          Keep the real rider page open when sharing GPS. Background tracking
          and turn-by-turn voice navigation require further platform support.
        </p>
      </div>
    </>
  );
}

/** @param {{onAdd:(line:CartLine)=>void, state:DemoState,onRetry:()=>void}} props */
function MenuView({ onAdd, state, onRetry }) {
  const [category, setCategory] = useState("All dishes");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    /** @type {MockMenuItem|null} */ (null),
  );
  const [variantIndex, setVariantIndex] = useState(0);
  const [addons, setAddons] = useState(/** @type {number[]} */ ([]));
  const categories = [
    "All dishes",
    ...new Set(MOCK_MENU_ITEMS.map((item) => item.category)),
  ];
  const items = MOCK_MENU_ITEMS.filter(
    (item) =>
      (category === "All dishes" || item.category === category) &&
      item.name.toLowerCase().includes(query.toLowerCase()),
  );
  const price = selected
    ? selected.price +
      (selected.variants[variantIndex]?.priceAdjustment || 0) +
      addons.reduce((sum, index) => sum + selected.addOns[index].price, 0)
    : 0;
  return (
    <>
      <div className="df-menu-toolbar">
        <div className="df-chips" aria-label="Menu categories">
          {categories.map((name) => (
            <button
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
              key={name}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="df-search">
          <Search size={18} aria-hidden="true" />
          <span className="df-sr-only">Search dishes</span>
          <input
            placeholder="Find your favorite"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <StateContent state={state} onRetry={onRetry}>
        {items.length ? (
          <div className="df-menu-grid">
            {items.map((item) => (
              <article className="df-dish" key={item.id}>
                <DishPhoto item={item} />
                <div className="df-dish-body">
                  <div>
                    <span className="df-kicker">{item.category}</span>
                    {!item.isAvailable && <StatusBadge status="Unavailable" />}
                  </div>
                  <h2>{item.name}</h2>
                  <p>{item.description}</p>
                  <footer>
                    <strong>{money(item.price)}</strong>
                    <Action
                      secondary
                      disabled={!item.isAvailable}
                      aria-label={`Customize ${item.name}`}
                      onClick={() => {
                        setSelected(item);
                        setVariantIndex(0);
                        setAddons([]);
                      }}
                    >
                      Customize <Plus size={17} aria-hidden="true" />
                    </Action>
                  </footer>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <StatePanel
            state="empty"
            title="No dishes match"
            description="Try another category or a shorter search."
          />
        )}
      </StateContent>
      <Drawer
        open={Boolean(selected)}
        title={selected ? `Customize ${selected.name}` : "Customize dish"}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="df-customize">
            <DishPhoto item={selected} />
            <p>{selected.description}</p>
            {selected.variants.length > 0 && (
              <fieldset>
                <legend>Choose your option</legend>
                {selected.variants.map((variant, index) => (
                  <label className="df-choice" key={variant.name}>
                    <input
                      type="radio"
                      name="dish-variant"
                      checked={variantIndex === index}
                      onChange={() => setVariantIndex(index)}
                    />
                    <span>{variant.name}</span>
                    <strong>
                      {variant.priceAdjustment
                        ? `+${money(variant.priceAdjustment)}`
                        : "Included"}
                    </strong>
                  </label>
                ))}
              </fieldset>
            )}
            {selected.addOns.length > 0 && (
              <fieldset>
                <legend>
                  Make it yours <small>Optional</small>
                </legend>
                {selected.addOns.map((addon, index) => (
                  <label key={addon.name} className="df-choice">
                    <input
                      type="checkbox"
                      checked={addons.includes(index)}
                      onChange={() =>
                        setAddons((current) =>
                          current.includes(index)
                            ? current.filter((value) => value !== index)
                            : [...current, index],
                        )
                      }
                    />
                    <span>{addon.name}</span>
                    <strong>+{money(addon.price)}</strong>
                  </label>
                ))}
              </fieldset>
            )}
            <Action
              onClick={() => {
                onAdd({
                  item: selected,
                  variant: selected.variants[variantIndex]?.name || "Standard",
                  addons: addons.map((index) => selected.addOns[index].name),
                  unitPrice: price,
                });
                setSelected(null);
              }}
            >
              Add to bag · {money(price)}
              <ShoppingBag size={18} aria-hidden="true" />
            </Action>
          </div>
        )}
      </Drawer>
    </>
  );
}

/** @param {{onReserve:()=>void,onAdd:(line:CartLine)=>void,state:DemoState,onRetry:()=>void}} props */
function LandingView({ onReserve, onAdd, state, onRetry }) {
  const [distance, setDistance] = useState("3");
  const [coverage, setCoverage] = useState("");
  const hero = MOCK_MENU_ITEMS[0];
  return (
    <div className="df-landing">
      <header className="df-public-nav">
        <a className="df-brand" href="#landing-main">
          <UtensilsCrossed aria-hidden="true" />
          DineFlow<span>.</span>
        </a>
        <nav aria-label="Restaurant">
          <a href="#featured-menu">Our menu</a>
          <button onClick={onReserve}>Book a table</button>
          <a href="#delivery-check">Delivery</a>
        </nav>
        <span className="df-public-status">
          <span />
          Sample outlet open
        </span>
      </header>
      <section className="df-hero" id="landing-main">
        <div className="df-hero-copy">
          <p className="df-kicker">
            <Leaf size={16} aria-hidden="true" />
            Made with care. Shared with joy.
          </p>
          <h1>
            Less waiting.
            <br />
            More savoring.
          </h1>
          <p>
            Good food brings people together. Discover your next favorite, find
            your perfect table, or let us bring dinner to you.
          </p>
          <div className="df-hero-actions">
            <a className="df-action" href="#featured-menu">
              Explore menu <ArrowRight size={18} aria-hidden="true" />
            </a>
            <Action secondary onClick={onReserve}>
              Book a table <Table2 size={18} aria-hidden="true" />
            </Action>
          </div>
          <div className="df-hero-detail">
            <span>
              <Check size={17} aria-hidden="true" />
              Your meal, your way
            </span>
            <span>
              <MapPin size={17} aria-hidden="true" />
              Pickup & delivery
            </span>
          </div>
        </div>
        <div className="df-hero-art">
          <DishPhoto item={hero} hero />
          <div className="df-featured-label">
            <span>From our kitchen</span>
            <strong>{hero.name}</strong>
            <span>{money(hero.price)} · Made to order</span>
          </div>
        </div>
      </section>
      <div className="df-promise-strip">
        <span>
          <UtensilsCrossed size={20} aria-hidden="true" />
          Thoughtfully prepared
        </span>
        <span>
          <Table2 size={20} aria-hidden="true" />A table for every occasion
        </span>
        <span>
          <Bike size={20} aria-hidden="true" />
          Fresh to your doorstep
        </span>
      </div>
      <section id="featured-menu" className="df-landing-section">
        <header className="df-section-heading">
          <div>
            <p className="df-kicker">Find a new favorite</p>
            <h2>A little something to savor.</h2>
          </div>
          <p>
            Seasonal ingredients. Familiar comfort.
            <br />
            Prepared just the way you like it.
          </p>
        </header>
        <MenuView onAdd={onAdd} state={state} onRetry={onRetry} />
      </section>
      <section className="df-reserve-banner">
        <div>
          <p className="df-kicker">Room for good company</p>
          <h2>Your evening starts with a table.</h2>
          <p>Choose a time, explore the floor plan, and find your spot.</p>
        </div>
        <Action onClick={onReserve}>
          Plan your visit <ArrowRight size={18} aria-hidden="true" />
        </Action>
      </section>
      <section id="delivery-check" className="df-delivery-check">
        <div>
          <p className="df-kicker">A little closer to dinner</p>
          <h2>Within reach? Let’s check.</h2>
          <p>
            Our sample coverage reaches {MOCK_RESTAURANT_INFO.deliveryRadiusKm}{" "}
            km. The live app checks your address and route before quoting.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const km = Number(distance);
            setCoverage(
              Number.isFinite(km) && km >= 0 && km <= 12.5
                ? "Inside sample coverage. The live app confirms the address, minimum order and route fee."
                : "Outside sample coverage. Try pickup or choose a closer address.",
            );
          }}
        >
          <label>
            Sample distance from restaurant (km)
            <input
              type="number"
              min="0"
              max="999"
              step="0.1"
              required
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
            />
          </label>
          <Action type="submit">
            Check coverage <ArrowRight size={18} aria-hidden="true" />
          </Action>
          <p role="status" aria-live="polite">
            {coverage || "Illustrative check · no location is requested."}
          </p>
        </form>
      </section>
      <footer className="df-public-footer">
        <strong>{MOCK_RESTAURANT_INFO.name}</strong>
        <p>{MOCK_RESTAURANT_INFO.address}</p>
        <span>Good food. Smooth operations.</span>
      </footer>
    </div>
  );
}

/** @param {{onDone:(message:string)=>void}} props */
function ReservationWizard({ onDone }) {
  const [step, setStep] = useState(0);
  const stepHeading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  useEffect(() => {
    stepHeading.current?.focus({ preventScroll: true });
  }, [step]);
  const [guests, setGuests] = useState(2);
  const [date, setDate] = useState("2026-10-28");
  const [time, setTime] = useState("19:30");
  const [table, setTable] = useState("t_01");
  const available = MOCK_TABLES.filter(
    (row) => row.status === "Available" && row.seats >= guests,
  );
  const choices = ["Party", "Time", "Table", "Review"];
  return (
    <div className="df-wizard">
      <ol className="df-wizard-steps" aria-label="Reservation steps">
        {choices.map((name, index) => (
          <li key={name} aria-current={index === step ? "step" : undefined}>
            <span>{index + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <h3 ref={stepHeading} tabIndex={-1} className="df-step-heading">
        {choices[step]} · Step {step + 1} of 4
      </h3>
      <p className="df-caption">
        Booking design preview. Availability and policies here are fixtures.
      </p>
      {step === 0 && (
        <fieldset>
          <legend>Good company, how many?</legend>
          <label className="df-form-field">
            Party size
            <select
              value={guests}
              onChange={(event) => {
                setGuests(Number(event.target.value));
                setTable("");
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((size) => (
                <option value={size} key={size}>
                  {size} {size === 1 ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      {step === 1 && (
        <fieldset>
          <legend>When shall we welcome you?</legend>
          <label className="df-form-field">
            Date
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="df-form-field">
            Time
            <select
              value={time}
              onChange={(event) => setTime(event.target.value)}
            >
              {["18:00", "18:30", "19:00", "19:30", "20:00"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      {step === 2 && (
        <fieldset>
          <legend>Find your favorite spot</legend>
          {available.length ? (
            <div className="df-floor-choice">
              {available.map((row) => (
                <label className="df-choice" key={row.id}>
                  <input
                    name="reservation-table"
                    type="radio"
                    value={row.id}
                    checked={table === row.id}
                    onChange={() => setTable(row.id)}
                  />
                  <Table2 size={24} aria-hidden="true" />
                  <span>
                    {row.tableNumber}
                    <small>
                      {row.zone} · {row.seats} seats
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <StatePanel
              state="empty"
              title="No single table fits this party"
              description="Go back to choose a smaller party. Combined tables and alternate availability require the live reservation service."
            />
          )}
          <p className="df-caption">
            Text choices provide an equivalent to the live app’s 2D/3D floor
            plan.
          </p>
        </fieldset>
      )}
      {step === 3 && (
        <>
          <h3>Make it an evening to remember.</h3>
          <dl className="df-totals">
            <div>
              <dt>Guests</dt>
              <dd>{guests}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{time}</dd>
            </div>
            <div>
              <dt>Table</dt>
              <dd>
                {MOCK_TABLES.find((row) => row.id === table)?.tableNumber}
              </dd>
            </div>
          </dl>
          <div className="df-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>
              {guests > 4
                ? "The brief proposes a deposit for larger parties. Guest-count basis and automatic refund rules need confirmation before a real charge."
                : "No deposit in this small-party example. The live app applies the restaurant’s configured policy."}
            </p>
          </div>
        </>
      )}
      <div className="df-drawer-actions">
        {step > 0 && (
          <Action secondary onClick={() => setStep(step - 1)}>
            Back
          </Action>
        )}
        <Action
          disabled={
            (step === 1 && !date) ||
            (step === 2 && !available.some((row) => row.id === table))
          }
          onClick={() =>
            step < 3
              ? setStep(step + 1)
              : onDone(
                  "Reservation preview complete. No booking or payment was created.",
                )
          }
        >
          {step === 3 ? "Finish booking preview" : "Continue"}
          <ArrowRight size={18} aria-hidden="true" />
        </Action>
      </div>
    </div>
  );
}

/** @param {{onDone:(message:string)=>void}} props */
function TableOrderWizard({ onDone }) {
  const [step, setStep] = useState(0);
  const stepHeading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  useEffect(() => {
    stepHeading.current?.focus({ preventScroll: true });
  }, [step]);
  const [table, setTable] = useState("T-02");
  const [dish, setDish] = useState(MOCK_MENU_ITEMS[0].id);
  const selected =
    MOCK_MENU_ITEMS.find((item) => item.id === dish) || MOCK_MENU_ITEMS[0];
  return (
    <div className="df-wizard">
      <h3 ref={stepHeading} tabIndex={-1} className="df-step-heading">
        Proposed staff order entry · Step {step + 1} of 3
      </h3>
      {step === 0 ? (
        <label className="df-form-field">
          Occupied table
          <select
            value={table}
            onChange={(event) => setTable(event.target.value)}
          >
            {MOCK_TABLES.filter((row) => row.status === "Occupied").map(
              (row) => (
                <option key={row.id}>{row.tableNumber}</option>
              ),
            )}
          </select>
        </label>
      ) : step === 1 ? (
        <label className="df-form-field">
          Dish
          <select
            value={dish}
            onChange={(event) => setDish(event.target.value)}
          >
            {MOCK_MENU_ITEMS.filter((item) => item.isAvailable).map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {money(item.price)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <h3>Review your table ticket</h3>
          <p>
            {table} · 1 × {selected.name}
          </p>
          <strong>{money(selected.price)} before taxes and charges</strong>
          <p className="df-caption">
            A live staff flow must bind this ticket to the guest and open dining
            session.
          </p>
        </>
      )}
      <div className="df-drawer-actions">
        {step > 0 && (
          <Action secondary onClick={() => setStep(step - 1)}>
            Back
          </Action>
        )}
        <Action
          onClick={() =>
            step < 2
              ? setStep(step + 1)
              : onDone(
                  "Table ticket reviewed locally. No kitchen order was submitted.",
                )
          }
        >
          {step < 2 ? "Continue" : "Finish ticket preview"}
        </Action>
      </div>
    </div>
  );
}

function ReconciliationPreview() {
  const [counted, setCounted] = useState("");
  const expected = MOCK_ORDERS.filter(
    (order) => order.paymentStatus === "Paid (Cash)",
  ).reduce((sum, order) => sum + order.total, 0);
  const amount = Number(counted);
  return (
    <div className="df-wizard">
      <p className="df-caption">
        Design proposal. Fixture cash receipts exclude opening float, payouts
        and refunds; this is not a real shift balance.
      </p>
      <dl className="df-totals">
        <div>
          <dt>Sample cash receipts</dt>
          <dd>{money(expected)}</dd>
        </div>
      </dl>
      <label className="df-form-field">
        Counted sample cash (USD)
        <input
          inputMode="decimal"
          type="number"
          step="0.01"
          min="0"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
        />
      </label>
      <p role="status" aria-live="polite">
        {counted === ""
          ? "Enter an amount to compare."
          : Number.isFinite(amount) && amount >= 0
            ? `Difference: ${money(Math.round((amount - expected) * 100) / 100)}`
            : "Enter a valid non-negative amount."}
      </p>
      <div className="df-note">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          Reconciliation needs an auditable ledger, shift ownership and approval
          rules before it can be submitted.
        </p>
      </div>
    </div>
  );
}

export function DesignLab() {
  const [role, setRole] = useState(() =>
    previewRole(new URLSearchParams(window.location.search).get("view")),
  );
  const [dark, setDark] = useState(false);
  const [state, setState] = useState(/** @type {DemoState} */ ("ready"));
  const [volume, setVolume] = useState(false);
  const [navigation, setNavigation] = useState(false);
  const [tool, setTool] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [selected, setSelected] = useState(
    /** @type {MockOrder|null} */ (null),
  );
  const [cart, setCart] = useState(/** @type {CartLine[]} */ ([]));
  const model = ROLE_LAYOUTS[role];
  const orders = useMemo(() => orderDataset(volume), [volume]);
  const user =
    MOCK_USERS.find((person) => person.role === model.label) || MOCK_USERS[6];
  const cartTotal =
    Math.round(cart.reduce((sum, line) => sum + line.unitPrice, 0) * 100) / 100;
  useEffect(() => {
    document.title = `${model.label} · DineFlow design preview`;
  }, [model.label]);
  /** @param {PreviewRole} next */
  function changeRole(next) {
    setRole(next);
    setNavigation(false);
    setTool("");
    setSelected(null);
    setNotice("");
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }
  /** @param {CartLine} line */
  function addLine(line) {
    setCart((current) => [...current, line]);
    setNotice(`${line.item.name} added to your preview bag.`);
  }
  /** @param {string} message */
  function done(message) {
    setTool("");
    setNotice(message);
  }
  /** @param {MockOrder} order */
  function viewOrder(order) {
    setSelected(order);
    setPaymentNotice("");
  }
  const retry = () => {
    setState("ready");
    setNotice("Sample data restored.");
  };
  const common = { state, onRetry: retry };
  return (
    <div
      className="df-theme df-lab"
      data-df-role={role}
      data-df-theme={dark ? "dark" : "light"}
    >
      <a href="#df-main" className="df-skip-link">
        Skip to page content
      </a>
      <div className="df-review-toolbar">
        <div>
          <Leaf size={18} aria-hidden="true" />
          <strong>DineFlow / Design lab</strong>
          <span>Fixture data · local actions only</span>
        </div>
        <div className="df-review-controls">
          <label>
            Screen
            <select
              value={role}
              onChange={(event) => changeRole(previewRole(event.target.value))}
            >
              {Object.entries(ROLE_LAYOUTS).map(([key, value]) => (
                <option value={key} key={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            State
            <select
              aria-label="State"
              value={state}
              onChange={(event) =>
                setState(/** @type {DemoState} */ (event.target.value))
              }
            >
              <option value="ready">Populated</option>
              <option value="loading">Loading</option>
              <option value="empty">Empty</option>
              <option value="error">Error</option>
            </select>
          </label>
          <button
            className="df-icon-button"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setDark(!dark)}
          >
            {dark ? (
              <Sun size={19} aria-hidden="true" />
            ) : (
              <Moon size={19} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <main
        id="df-main"
        tabIndex={-1}
        className={role === "landing" ? "df-public-main" : "df-workspace"}
      >
        {role === "landing" ? (
          <LandingView
            {...common}
            onReserve={() => setTool("reservation")}
            onAdd={addLine}
          />
        ) : (
          <>
            <aside className="df-sidebar">
              <a
                className="df-brand"
                href="?view=landing"
                onClick={(event) => {
                  event.preventDefault();
                  changeRole("landing");
                }}
              >
                <UtensilsCrossed aria-hidden="true" />
                DineFlow<span>.</span>
              </a>
              <p className="df-sidebar-caption">{model.label} workspace</p>
              <div className="df-outlet-label">
                <Store size={18} aria-hidden="true" />
                Bistro & Lounge
              </div>
              <nav aria-label={`${model.label} workspace`}>
                {model.tasks.map((task, index) => (
                  <button
                    key={task}
                    aria-current={index === 0 ? "page" : undefined}
                    onClick={() =>
                      index
                        ? setTool(`task:${task}`)
                        : document
                            .getElementById("df-page-heading")
                            ?.scrollIntoView({ behavior: "instant" })
                    }
                  >
                    {index === 0 ? (
                      <LayoutDashboard size={18} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={18} aria-hidden="true" />
                    )}
                    {task}
                  </button>
                ))}
              </nav>
              <div className="df-sidebar-profile">
                <span>
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <small>{model.label}</small>
                </div>
              </div>
            </aside>
            <div className="df-workspace-body">
              <header className="df-workspace-topbar">
                <div>
                  <button
                    className="df-icon-button df-mobile-navigation"
                    aria-label="Open workspace navigation"
                    aria-expanded={navigation}
                    onClick={() => setNavigation(true)}
                  >
                    <Menu size={20} aria-hidden="true" />
                  </button>
                  <span>{model.label}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                  <span>{model.tasks[0]}</span>
                </div>
                <button
                  className="df-icon-button"
                  aria-label="Preview notifications"
                  onClick={() => {
                    setTool("notifications");
                  }}
                >
                  <Bell size={20} aria-hidden="true" />
                </button>
              </header>
              <div className="df-page">
                <header className="df-page-heading" id="df-page-heading">
                  <div>
                    <p className="df-kicker">
                      {role === "customer"
                        ? "Something good is on the way"
                        : "Tuesday, October 27 · Sample service"}
                    </p>
                    <h1>{model.title}</h1>
                    <p>{model.summary}</p>
                  </div>
                  {role === "cashier" ? (
                    <Action secondary onClick={() => setTool("reconciliation")}>
                      Review drawer
                    </Action>
                  ) : role === "customer" ? (
                    <Action secondary onClick={() => setTool("reservation")}>
                      Book a table
                    </Action>
                  ) : role === "administrator" || role === "manager" ? (
                    <label className="df-volume-toggle">
                      <input
                        type="checkbox"
                        checked={volume}
                        onChange={(event) => setVolume(event.target.checked)}
                      />
                      128-row stress test
                    </label>
                  ) : null}
                </header>
                {role === "administrator" && (
                  <OperationsView
                    {...common}
                    orders={orders}
                    onView={viewOrder}
                    onExpand={() => setTool("map")}
                  />
                )}
                {role === "manager" && (
                  <OperationsView
                    {...common}
                    manager
                    orders={orders}
                    onView={viewOrder}
                    onExpand={() => setTool("map")}
                  />
                )}
                {role === "cashier" && (
                  <CashierView
                    {...common}
                    onView={viewOrder}
                    onReconcile={() => setTool("reconciliation")}
                  />
                )}
                {role === "kitchen_staff" && (
                  <KitchenView key={role} {...common} onNotice={setNotice} />
                )}
                {role === "waiter" && (
                  <WaiterView
                    {...common}
                    onOrder={() => setTool("table-order")}
                  />
                )}
                {role === "rider" && (
                  <RiderView
                    {...common}
                    onExpand={() => setTool("map")}
                    onNotice={setNotice}
                  />
                )}
                {role === "customer" && (
                  <MenuView {...common} onAdd={addLine} />
                )}
                <footer className="df-workspace-footer">
                  <span>DineFlow · Good food. Smooth operations.</span>
                  <span>USD fixture preview · production uses PHP</span>
                </footer>
              </div>
            </div>
          </>
        )}
      </main>
      <div className="df-announcement" role="status" aria-live="polite">
        {notice && (
          <>
            <Check size={18} aria-hidden="true" />
            {notice}
            <button
              className="df-icon-button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {(role === "customer" || role === "landing") && cart.length > 0 && (
        <div className="df-cart-bar">
          <span>
            <ShoppingBag size={20} aria-hidden="true" />
            {cart.length} {cart.length === 1 ? "item" : "items"} ·{" "}
            {money(cartTotal)}
          </span>
          <Action onClick={() => setTool("cart")}>
            Review bag <ArrowRight size={18} aria-hidden="true" />
          </Action>
        </div>
      )}
      <Drawer
        open={navigation}
        title={`${model.label} navigation`}
        onClose={() => setNavigation(false)}
        side="left"
      >
        <nav className="df-drawer-nav" aria-label="Mobile workspace">
          {model.tasks.map((task, index) => (
            <button
              key={task}
              onClick={() => {
                setNavigation(false);
                if (index) setTool(`task:${task}`);
              }}
              aria-current={index === 0 ? "page" : undefined}
            >
              {task}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </nav>
      </Drawer>
      <Drawer
        open={Boolean(selected)}
        title={
          selected
            ? `${role === "cashier" ? "Review bill" : "Order details"} · ${selected.id}`
            : "Order details"
        }
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <div className="df-detail-header">
              <div>
                <h3>{selected.customerName}</h3>
                <p>
                  {selected.orderType} ·{" "}
                  {selected.tableNumber ||
                    selected.address ||
                    "Pickup at restaurant"}
                </p>
              </div>
              <StatusBadge status={selected.status} />
            </div>
            <ul className="df-detail-items">
              {selected.items.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  <strong>
                    {item.qty} × {item.name}
                  </strong>
                  <span>{item.variant}</span>
                  <small>{item.addOns.join(", ") || "No add-ons"}</small>
                </li>
              ))}
            </ul>
            <dl className="df-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(selected.subtotal)}</dd>
              </div>
              {selected.serviceCharge ? (
                <div>
                  <dt>Service charge</dt>
                  <dd>{money(selected.serviceCharge)}</dd>
                </div>
              ) : null}
              {selected.deliveryFee ? (
                <div>
                  <dt>Delivery fee</dt>
                  <dd>{money(selected.deliveryFee)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Tax</dt>
                <dd>{money(selected.tax)}</dd>
              </div>
              <div className="df-grand-total">
                <dt>Total</dt>
                <dd>{money(selected.total)}</dd>
              </div>
            </dl>
            <p className="df-caption">
              Totals are preserved from the supplied fixtures. The audit records
              their pricing ambiguities.
            </p>
            {role === "cashier" && (
              <>
                <div className="df-drawer-actions">
                  <Action
                    secondary
                    onClick={() =>
                      setPaymentNotice(
                        "Cash recording preview only. No payment was recorded.",
                      )
                    }
                  >
                    Record cash preview
                  </Action>
                  <Action
                    onClick={() =>
                      setPaymentNotice(
                        "Hosted checkout preview only. No gateway session was created.",
                      )
                    }
                  >
                    Online checkout preview
                  </Action>
                </div>
                <p className="df-caption" role="status" aria-live="polite">
                  {paymentNotice || "Choose a method to preview settlement."}
                </p>
              </>
            )}
          </>
        )}
      </Drawer>
      <Drawer
        open={Boolean(tool)}
        title={
          tool === "reservation"
            ? "Find your table"
            : tool === "map"
              ? "Delivery coverage diagram"
              : tool === "reconciliation"
                ? "Shift reconciliation preview"
                : tool === "table-order"
                  ? "New table order preview"
                  : tool === "cart"
                    ? "Your preview bag"
                    : tool === "notifications"
                      ? "Notifications"
                      : tool.replace("task:", "")
        }
        onClose={() => setTool("")}
      >
        {tool === "reservation" && <ReservationWizard onDone={done} />}
        {tool === "map" && (
          <>
            <CoverageMap />
            <p className="df-caption">
              A readable diagram complements map interaction. Production maps
              retain Leaflet navigation, GPS freshness checks and fullscreen
              controls.
            </p>
          </>
        )}
        {tool === "reconciliation" && <ReconciliationPreview />}
        {tool === "table-order" && <TableOrderWizard onDone={done} />}
        {tool === "notifications" && (
          <>
            <article className="df-notification">
              <TriangleAlert size={20} aria-hidden="true" />
              <div>
                <h3>
                  {role === "administrator" || role === "manager"
                    ? "Delivery needs attention"
                    : `${model.label} workspace update`}
                </h3>
                <p>
                  {role === "administrator" || role === "manager"
                    ? "A sample delivery needs review."
                    : "Updates appear only for tasks and records available to this role."}
                </p>
                <small>Illustrative fixture event</small>
              </div>
            </article>
            <p className="df-caption">
              Notification content is scoped to the selected role in production.
            </p>
          </>
        )}
        {tool.startsWith("task:") && (
          <>
            <p>
              This contextual destination keeps the main dashboard focused on
              the role’s next task.
            </p>
            <p className="df-caption">
              The responsive specification documents its existing route and
              component ownership. This preview does not call production
              services.
            </p>
            <Action secondary onClick={() => setTool("")}>
              Return to dashboard
            </Action>
          </>
        )}
        {tool === "cart" && (
          <>
            <ul className="df-detail-items">
              {cart.map((line, index) => (
                <li key={`${line.item.id}-${index}`}>
                  <strong>{line.item.name}</strong>
                  <span>
                    {line.variant}
                    {line.addons.length > 0
                      ? ` · ${line.addons.join(", ")}`
                      : ""}
                  </span>
                  <strong>{money(line.unitPrice)}</strong>
                  <button
                    className="df-text-button"
                    aria-label={`Remove ${line.item.name} ${index + 1} from bag`}
                    onClick={() =>
                      setCart((current) =>
                        current.filter((_, row) => row !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <dl className="df-totals">
              <div className="df-grand-total">
                <dt>Item subtotal</dt>
                <dd>{money(cartTotal)}</dd>
              </div>
            </dl>
            <p className="df-caption">
              Taxes, service charge and delivery depend on the selected
              fulfillment and confirmed restaurant policy. No payment is
              collected here.
            </p>
            <Action
              disabled={!cart.length}
              onClick={() =>
                done(
                  "Bag reviewed. Continue in the live app for a server-calculated total and secure checkout.",
                )
              }
            >
              Finish bag preview
              <ArrowRight size={18} aria-hidden="true" />
            </Action>
          </>
        )}
      </Drawer>
    </div>
  );
}
