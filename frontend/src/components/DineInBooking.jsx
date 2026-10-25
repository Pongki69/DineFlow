import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { api } from "../api";
import { Button, Field } from "./ui";

export function DineInBooking({ onReadyChange }) {
  const [bookings, setBookings] = useState([]);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = bookings.find((booking) => booking.reference === choice);
  const ready =
    choice === "manual" || (!loading && !error && Boolean(selected?.ready));
  useEffect(() => {
    onReadyChange?.(ready);
  }, [onReadyChange, ready]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await api("/orders/dine-in-reservations", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setBookings(result.data || []);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [retry]);

  return (
    <div className="dine-in-booking">
      <fieldset className="booking-picker" aria-busy={loading}>
        <legend>Your reservation</legend>
        <Button
          className="booking-refresh icon-button"
          variant="secondary"
          disabled={loading}
          aria-label="Refresh reservations"
          title="Refresh reservations"
          onClick={() => setRetry((value) => value + 1)}
        >
          <RefreshCw
            size={15}
            className={loading ? "spin" : undefined}
            aria-hidden="true"
          />
        </Button>
        <p className="booking-picker-caption">
          Choose the table for this order.
        </p>
        {loading && (
          <p className="dine-in-booking-hint">Checking reservations…</p>
        )}
        <div className="booking-picker-list">
          {bookings.map((booking) => {
            const date = new Date(booking.starts_at);
            return (
              <label
                key={booking.reference}
                className={`booking-choice${choice === booking.reference ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="dine_in_choice"
                  value={booking.reference}
                  required
                  checked={choice === booking.reference}
                  disabled={loading}
                  onChange={() => setChoice(booking.reference)}
                />
                <span className="booking-choice-content">
                  <span className="booking-choice-top">
                    <strong>{booking.table_number || "Table pending"}</strong>
                    <span
                      className={`booking-status${booking.ready ? " is-ready" : ""}`}
                    >
                      {booking.ready
                        ? "Ready to order"
                        : booking.status.replaceAll("_", " ")}
                    </span>
                  </span>
                  <span className="booking-choice-date">
                    {date.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    ·{" "}
                    {date.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="booking-choice-reference">
                    {booking.reference}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <label className="booking-manual-choice">
          <input
            type="radio"
            name="dine_in_choice"
            value="manual"
            required
            checked={choice === "manual"}
            onChange={() => setChoice("manual")}
          />
          Enter a code instead
        </label>
      </fieldset>
      {choice !== "manual" && (
        <input type="hidden" name="table_code" value={choice} />
      )}
      {selected && !loading && !error && (
        <p
          className={`booking-selection-note${selected.ready ? " is-ready" : ""}`}
          role="status"
        >
          {selected.ready ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <Clock3 size={16} aria-hidden="true" />
          )}
          <span>
            {selected.ready
              ? "Your order will go to this table."
              : selected.status === "seated"
                ? "Your table session is unavailable. Ask staff to check it, then refresh this list."
                : "Waiting to be seated. Ask staff to seat your party, then refresh to start ordering."}
          </span>
        </p>
      )}
      {!loading && !error && bookings.length === 0 && (
        <p className="dine-in-booking-hint">
          No active bookings. Dining without a reservation? Ask staff for your
          table code.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          Could not load your reservations. Please try again.
        </p>
      )}
      {choice === "manual" && (
        <Field
          label="Reservation or table code"
          name="table_code"
          required
          maxLength={64}
          placeholder="RSV… or your table code"
          hint="Reservation references work only for your own seated booking. Table codes are provided by staff."
        />
      )}
    </div>
  );
}
