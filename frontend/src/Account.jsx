import { lazy, Suspense, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "./api";
import { NewPasswordFields } from "./components/NewPasswordFields";
import { validateNewPasswordForm } from "./components/passwordValidation";
import "./account.css";
import {
  Button,
  Feedback,
  Field,
  PageHeader,
  StatusBadge,
  Skeleton,
} from "./components/ui";

const SavedDeliveryAddresses = lazy(
  () => import("./components/SavedDeliveryAddresses"),
);

export function Account({
  user,
  onUpdated,
  embedded = false,
  showAddresses = true,
}) {
  const [error, setError] = useState(""),
    [errors, setErrors] = useState({}),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !validateNewPasswordForm(form, { optional: true })) return;
    const fields = Object.fromEntries(new FormData(form));
    if (!fields.password) {
      delete fields.password;
      delete fields.current_password;
      delete fields.password_confirmation;
    }
    setBusy(true);
    setError("");
    setErrors({});
    setNotice("");
    try {
      const result = await api("/me", {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      onUpdated(result.user);
      form.reset();
      setNotice("Account updated.");
    } catch (failure) {
      setError(failure.message);
      setErrors(failure.errors || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-page">
      {!embedded && (
        <PageHeader
          title="My account"
          description="Keep your details up to date and your account secure."
        />
      )}
      {error && <Feedback>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <div className="account-layout">
        <aside className="account-profile" aria-label="Your profile">
          <span className="avatar" aria-hidden="true">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <StatusBadge status={user.roles[0]} />
          <p className="profile-note">
            <ShieldCheck size={18} aria-hidden="true" />
            Your access is managed by your restaurant.
          </p>
        </aside>
        <form className="account-form" onSubmit={save} aria-busy={busy}>
          <div>
            <h2>Personal details</h2>
            <p>This is how your name appears on orders and reservations.</p>
          </div>
          <Field
            label="Name"
            name="name"
            defaultValue={user.name}
            required
            maxLength={120}
            autoComplete="name"
            error={errors.name?.[0]}
          />
          <fieldset>
            <legend>
              Change password <span className="optional-label">Optional</span>
            </legend>
            <p>Leave these fields empty to keep your current password.</p>
            <Field
              label="Current password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required={changingPassword}
              error={errors.current_password?.[0]}
            />
            <NewPasswordFields
              passwordLabel="New password"
              confirmationLabel="Confirm new password"
              optional
              errors={errors}
              onActiveChange={setChangingPassword}
              onEdit={() =>
                setErrors((current) => ({
                  ...current,
                  password: undefined,
                  password_confirmation: undefined,
                }))
              }
            />
          </fieldset>
          <Button type="submit" busy={busy}>
            {busy ? "Saving…" : "Save account"}
          </Button>
        </form>
      </div>
      {showAddresses && user.roles.includes("customer") && (
        <Suspense
          fallback={
            <Skeleton cards={1} label="Loading your saved delivery addresses" />
          }
        >
          <SavedDeliveryAddresses user={user} />
        </Suspense>
      )}
    </section>
  );
}
