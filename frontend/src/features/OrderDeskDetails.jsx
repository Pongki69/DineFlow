import {
  CircleCheck,
  CreditCard,
  History,
  MapPin,
  MessageSquareText,
  UserRound,
} from "lucide-react";

/*
 * Order management on the admin desktop: the extra queue columns and the
 * detail sections of the selected order. Phones and tablets keep their cards.
 */

const readable = (value) => String(value || "").replaceAll("_", " ");
const capitalised = (value) => {
  const text = readable(value);
  return text ? text[0].toUpperCase() + text.slice(1) : text;
};
const STATUS_TEXT = {
  pending: "Placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_to_serve: "Ready",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Paid, partly paid, checkout pending or unpaid, from the payment summary. */
export function paymentState(order) {
  const summary = order.payment_summary;
  if (!summary) return null;
  const paid = Number(summary.paid) || 0;
  const due = Number(summary.balance_due) || 0;
  if (order.status === "cancelled" && paid === 0)
    return { key: "none", label: "No payment" };
  if (due <= 0) return { key: "paid", label: "Paid" };
  if (Number(summary.pending) > 0)
    return { key: "pending", label: "Checkout pending" };
  if (paid > 0) return { key: "partial", label: "Partly paid" };
  return { key: "unpaid", label: "Unpaid" };
}

/** "6:28 PM" plus "12 min ago" for today's orders, else the date. */
export function placedText(value, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const minutes = Math.max(0, Math.round((now - date) / 60000));
  const ago =
    minutes < 1
      ? "Just now"
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 24 * 60
          ? `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`
          : null;
  return {
    iso: date.toISOString(),
    primary: sameDay
      ? time
      : date.toLocaleDateString([], { month: "short", day: "numeric" }),
    secondary: sameDay ? ago : time,
  };
}

export function PaymentStateBadge({ order }) {
  const state = paymentState(order);
  if (!state) return <span className="orders-payment-state">—</span>;
  return (
    <span className="orders-payment-state" data-state={state.key}>
      {state.label}
    </span>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="orders-detail-section">
      <h3>
        <Icon size={15} aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Customer, delivery, notes, payment and the status timeline. */
export function OrderDeskDetails({ order }) {
  const table = order.table?.table_number || order.table_number_snapshot;
  const contact = [
    ["Name", order.customer_name_snapshot || "Guest customer"],
    ["Email", order.customer_email_snapshot],
    ["Phone", order.delivery_phone],
    ["Table", order.order_type === "dine_in" ? table : null],
  ].filter(([, value]) => value);
  const delivery =
    order.order_type === "delivery"
      ? [
          ["Recipient", order.delivery_recipient_name],
          ["Address", order.delivery_address],
          ["Instructions", order.delivery_instructions],
          [
            "Rider",
            order.delivery?.rider?.name ||
              (order.delivery ? "Not assigned yet" : null),
          ],
        ].filter(([, value]) => value)
      : [];
  const methods = order.payment_summary?.methods || [];
  const state = paymentState(order);
  const history = [...(order.status_history || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );
  return (
    <div className="orders-detail-sections">
      <Section icon={UserRound} title="Customer">
        <dl className="orders-detail-list">
          {contact.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {delivery.length > 0 && (
        <Section icon={MapPin} title="Delivery">
          <dl className="orders-detail-list">
            {delivery.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {order.customer_notes && (
        <Section icon={MessageSquareText} title="Order note">
          <p className="orders-detail-note">{order.customer_notes}</p>
        </Section>
      )}
      {state && (
        <Section icon={CreditCard} title="Payment">
          <p className="orders-detail-payment">
            <span className="orders-payment-state" data-state={state.key}>
              {state.label}
            </span>
            {methods.length > 0 && (
              <span>Paid by {methods.map(capitalised).join(", ")}</span>
            )}
          </p>
        </Section>
      )}
      {history.length > 0 && (
        <Section icon={History} title="Timeline">
          <ol className="orders-detail-timeline">
            {history.map((step) => {
              const when = new Date(step.created_at);
              return (
                <li key={step.id} data-status={step.to_status}>
                  <CircleCheck size={14} aria-hidden="true" />
                  <span>
                    <strong>
                      {STATUS_TEXT[step.to_status] ||
                        capitalised(step.to_status)}
                    </strong>
                    {step.note && <small>{step.note}</small>}
                  </span>
                  {!Number.isNaN(when.getTime()) && (
                    <time dateTime={when.toISOString()}>
                      {when.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>
      )}
    </div>
  );
}
