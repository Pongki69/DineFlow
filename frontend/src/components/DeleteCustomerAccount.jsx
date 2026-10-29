import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api";
import { saveCart } from "../savedCart";
import { Button, Feedback, Field } from "./ui";
import "./deleteCustomerAccount.css";

export function DeleteCustomerAccount({ user, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const dialog = useRef(null);
  const trigger = useRef(null);
  const locked = useRef(false);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  if (user.roles.length !== 1 || user.roles[0] !== "customer") return null;

  function close() {
    if (locked.current) return;
    dialog.current?.close();
    setOpen(false);
    setPassword("");
    setConfirmed(false);
    setError("");
    setPasswordError("");
    trigger.current?.focus();
  }
  async function remove(event) {
    event.preventDefault();
    if (locked.current || !password || !confirmed) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setPasswordError("");
    try {
      await api("/me", {
        method: "DELETE",
        body: JSON.stringify({
          current_password: password,
          confirmation: true,
        }),
      });
      saveCart(user.id, []);
      setPassword("");
      dialog.current?.close();
      setOpen(false);
      onDeleted();
    } catch (failure) {
      setError(
        failure.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : failure.errors?.account?.[0] || failure.message,
      );
      setPasswordError(failure.errors?.current_password?.[0] || "");
      setPassword("");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="workspace-card customer-account-delete"
      aria-labelledby="delete-account-heading"
    >
      <h2 id="delete-account-heading">
        <Trash2 size={19} aria-hidden="true" />
        Delete account
      </h2>
      <p>
        Permanently remove your customer account, saved addresses and reviews.
        You will be signed out on all devices.
      </p>
      <p>
        Completed order, reservation and payment records remain with the
        restaurant. Personal contact fields on your orders and reservations will
        be removed.
      </p>
      <Button
        ref={trigger}
        variant="secondary"
        className="account-delete-button"
        onClick={() => setOpen(true)}
      >
        Delete my account
      </Button>
      <dialog
        ref={dialog}
        className="account-deletion-dialog"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {open && (
          <form onSubmit={remove} aria-busy={busy}>
            <h2 id="delete-account-title">Delete your account?</h2>
            <p id="delete-account-description">
              This permanently deletes your login, profile, saved addresses and
              reviews. Finish or cancel active orders and reservations first.
              Pending payments or refunds must also be resolved.
            </p>
            {error && <Feedback>{error}</Feedback>}
            <Field
              label="Current password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              maxLength={255}
              required
              autoFocus
              value={password}
              disabled={busy}
              error={passwordError}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError("");
              }}
            />
            <label className="account-deletion-confirmation">
              <input
                type="checkbox"
                required
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>I understand that deleting my account is permanent.</span>
            </label>
            <div className="account-deletion-actions">
              <Button variant="secondary" disabled={busy} onClick={close}>
                Keep my account
              </Button>
              <Button
                type="submit"
                className="account-delete-button"
                busy={busy}
                disabled={!password || !confirmed || busy}
              >
                {busy ? "Deleting account…" : "Permanently delete account"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
