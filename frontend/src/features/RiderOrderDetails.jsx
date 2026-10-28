import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  Clock3,
  MapPin,
  MessageSquareText,
  Phone,
  Route,
  StickyNote,
  Store,
  ArrowLeft,
  ReceiptText,
  ChevronRight,
} from "lucide-react";
import { api } from "../api";
import {
  EmptyState,
  Feedback,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "../components/ui";
import { DeliveryProofPhoto } from "../components/DeliveryProof";
import { RiderScreenSkeleton } from "../components/RiderScreenSkeleton";
import { OrderItemDetails } from "../components/OrderItemDetails";
import { Modal } from "../components/Modal";
import { deliveryLabels } from "../components/CustomerOrderProgress";
import "./workspaceSettings.css";
import "./riderSage.css";

const DeliveryEndpointsMap = lazy(() =>
  import("../components/DeliveryEndpointsMap").then((module) => ({
    default: module.DeliveryEndpointsMap,
  })),
);

const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value || 0),
  );

const orderDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const orderTime = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
function orderDateTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? `${orderDate.format(date)} · ${orderTime.format(date)}`
    : "Time not recorded";
}

function DeliveryText({ text, instructions = false }) {
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const container = useRef(null),
    measureText = useRef(null);
  useLayoutEffect(() => {
    let disposed = false;
    const measure = () => {
      const node = measureText.current;
      if (!node || disposed) return;
      const lineHeight = parseFloat(getComputedStyle(node).lineHeight);
      setOverflowing(node.getBoundingClientRect().height > lineHeight * 3 + 1);
    };
    measure();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (container.current) observer?.observe(container.current);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);
  const title = instructions ? "Drop-off instructions" : "Order note";
  const action = instructions ? "Read full instructions" : "Read full note";
  const Icon = instructions ? MessageSquareText : StickyNote;
  return (
    <section
      className={
        instructions ? "rider-instruction-note" : "rider-customer-note"
      }
      aria-label={title}
    >
      <h3>
        <Icon size={16} aria-hidden="true" />
        {title}
      </h3>
      <div className="rider-note-container" ref={container}>
        <div className="rider-note-measure-viewport" aria-hidden="true">
          <span className="rider-note-measure" ref={measureText}>
            {text}
          </span>
        </div>
        {overflowing ? (
          <button
            type="button"
            className="rider-note-open"
            aria-label={action}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <span className="rider-note-preview">{text}</span>
            <span className="rider-note-toggle">
              {action} <ChevronRight size={14} aria-hidden="true" />
            </span>
          </button>
        ) : (
          <span className="rider-note-preview">{text}</span>
        )}
      </div>
      <Modal
        open={open}
        title={title}
        eyebrow="FROM THE CUSTOMER"
        closeLabel={
          instructions ? "Close drop-off instructions" : "Close order note"
        }
        onClose={() => setOpen(false)}
      >
        <div
          className="rider-full-note"
          role="region"
          aria-label={
            instructions ? "Full drop-off instructions" : "Full order note"
          }
          tabIndex={0}
        >
          <p>{text}</p>
        </div>
      </Modal>
    </section>
  );
}

export function RiderOrderDetails() {
  const { deliveryId } = useParams();
  const [selectedItem, setSelectedItem] = useState(null);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(`/rider/deliveries/${deliveryId}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [deliveryId, retry]);
  const itemCount = (data?.items || []).reduce(
    (sum, item) => sum + Number(item.quantity),
    0,
  );
  const active =
    data &&
    [
      "assigned",
      "accepted",
      "arrived_at_restaurant",
      "picked_up",
      "in_transit",
    ].includes(data.status);
  return (
    <section className="rider-order-details">
      <Link className="rider-history-back" to="/rider/history">
        <ArrowLeft size={17} aria-hidden="true" />
        Back to history
      </Link>
      <PageHeader
        title={data ? `Order ${data.order.order_number}` : "Order details"}
        description="Recipient details, order contents, and your delivery record."
        actions={
          active && !loading && !error ? (
            <Link
              className="ui-button ui-button--primary rider-record-action"
              to={`/rider/deliveries?delivery=${deliveryId}`}
            >
              Continue active delivery
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      {loading ? (
        <RiderScreenSkeleton variant="details" label="Loading order details" />
      ) : error ? (
        <Feedback onRetry={() => setRetry((value) => value + 1)}>
          {error}
        </Feedback>
      ) : (
        data && (
          <>
            <section
              className="workspace-card rider-order-receipt"
              aria-label="Order receipt"
            >
              <div className="workspace-card-heading">
                <h2>
                  <ReceiptText size={21} aria-hidden="true" />
                  Order summary
                </h2>
                <StatusBadge status={data.status} />
              </div>
              <time dateTime={data.order.created_at}>
                {orderDateTime(data.order.created_at)}
              </time>
              <div className="rider-receipt-body">
                <div className="rider-receipt-lines">
                  <div className="rider-receipt-column-labels">
                    <span>Items</span>
                    <span>Amount</span>
                  </div>
                  {data.items.length ? (
                    <ul className="rider-order-items">
                      {data.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="rider-order-item-trigger"
                            onClick={() => setSelectedItem(item)}
                            aria-label={`View item details: ${item.item_name_snapshot}`}
                          >
                            <span className="rider-order-item-copy">
                              <strong>
                                {item.quantity} × {item.item_name_snapshot}
                              </strong>
                              {item.variant_name_snapshot && (
                                <small>{item.variant_name_snapshot}</small>
                              )}
                              {item.addons?.map((addon) => (
                                <small key={addon.id}>
                                  +{" "}
                                  {addon.addon_name_snapshot ||
                                    addon.name_snapshot ||
                                    "Add-on"}
                                </small>
                              ))}
                              {item.special_instructions && (
                                <small>{item.special_instructions}</small>
                              )}
                            </span>
                            <span className="rider-order-item-amount">
                              <strong>{money(item.line_total)}</strong>
                              <ChevronRight size={16} aria-hidden="true" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="No item details available"
                      description="Contact the restaurant for this order’s item breakdown."
                    />
                  )}
                </div>
                <div className="rider-receipt-footer">
                  <span className="rider-receipt-count">
                    {itemCount} {itemCount === 1 ? "item" : "items"} in this
                    order
                  </span>
                  <dl className="rider-order-totals">
                    {[
                      ["Subtotal", data.order.subtotal],
                      [
                        "Discounts",
                        -Number(data.order.item_discount_total || 0),
                      ],
                      ["Delivery fee", data.order.delivery_fee],
                      ["Service charge", data.order.service_charge],
                      ["Tax", data.order.tax],
                    ]
                      .filter(
                        ([label, value]) =>
                          label === "Subtotal" || Number(value) !== 0,
                      )
                      .map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{money(value)}</dd>
                        </div>
                      ))}
                    <div>
                      <dt>Order total</dt>
                      <dd>{money(data.order.total)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>
            <div className="workspace-settings-grid rider-record-grid">
              <section className="workspace-card rider-delivery-info">
                <h2>
                  <Route size={20} aria-hidden="true" />
                  Delivery details
                </h2>
                <section
                  className="rider-recipient-card"
                  aria-label="Recipient and contact"
                >
                  <div className="rider-recipient-identity">
                    <div>
                      <span className="rider-detail-label">Recipient</span>
                      <strong>
                        {data.order.delivery_recipient_name || "Not recorded"}
                      </strong>
                    </div>
                  </div>
                  {data.order.delivery_phone && (
                    <a
                      className="rider-recipient-call"
                      aria-label={`Call recipient at ${data.order.delivery_phone}`}
                      href={`tel:${data.order.delivery_phone.replace(/[^+\d]/g, "")}`}
                    >
                      <Phone size={16} aria-hidden="true" />
                      {data.order.delivery_phone}
                    </a>
                  )}
                </section>
                <ol
                  className="rider-address-route"
                  aria-label="Delivery route"
                  role="list"
                >
                  <li className="rider-pickup-address">
                    <span className="rider-route-icon">
                      <Store size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <span className="rider-detail-label">Pickup</span>
                      <p>{data.pickup.address || "Restaurant"}</p>
                    </div>
                  </li>
                  <li className="rider-dropoff-address">
                    <span className="rider-route-icon rider-route-destination">
                      <MapPin size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <span className="rider-detail-label">Drop-off</span>
                      <p>{data.order.delivery_address || "Not recorded"}</p>
                    </div>
                  </li>
                </ol>

                {data.order.delivery_instructions && (
                  <DeliveryText
                    key={`${deliveryId}-instructions`}
                    text={data.order.delivery_instructions}
                    instructions
                  />
                )}
                {data.order.customer_notes && (
                  <DeliveryText
                    key={deliveryId}
                    text={data.order.customer_notes}
                  />
                )}
              </section>
              <section className="workspace-card">
                <h2>
                  <Clock3 size={20} aria-hidden="true" />
                  Delivery timeline
                </h2>
                <ol className="rider-order-events" role="list">
                  {data.history.map((event) => (
                    <li key={event.id}>
                      <strong>
                        {deliveryLabels[event.to_status] ||
                          event.to_status.replaceAll("_", " ")}
                      </strong>
                      <time dateTime={event.created_at}>
                        {orderDateTime(event.created_at)}
                      </time>
                      {event.reason && <p>{event.reason}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            {data.proof_available && (
              <DeliveryProofPhoto deliveryId={deliveryId} />
            )}
            <Suspense fallback={<Skeleton label="Loading delivery map" />}>
              <DeliveryEndpointsMap
                deliveryId={deliveryId}
                pickup={data.pickup}
                destination={data.destination}
              />
            </Suspense>
          </>
        )
      )}
      <OrderItemDetails
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </section>
  );
}
