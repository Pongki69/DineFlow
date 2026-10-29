import { useEffect, useId, useRef, useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Field } from "./ui";
import { passwordPairValidation } from "./passwordValidation";
import "./newPasswordFields.css";

export function NewPasswordFields({
  passwordLabel = "Password",
  confirmationLabel = "Confirm password",
  optional = false,
  errors = {},
  onEdit,
  onActiveChange,
}) {
  const id = useId();
  const passwordInput = useRef(null);
  const confirmationInput = useRef(null);
  const [values, setValues] = useState({ password: "", confirmation: "" });
  const [touched, setTouched] = useState({
    password: false,
    confirmation: false,
  });
  const [reveal, setReveal] = useState(false);
  const validation = passwordPairValidation(
    values.password,
    values.confirmation,
    optional,
  );
  const passwordId = `${id}-password`;
  const confirmationId = `${id}-confirmation`;
  const rulesId = `${id}-requirements`;
  const statusId = `${id}-password-status`;
  const passwordFeedback =
    values.password || (touched.password && validation.active)
      ? validation.password || "Password meets all requirements."
      : "";
  const confirmationError =
    values.confirmation || (touched.confirmation && validation.active)
      ? validation.confirmation
      : "";
  const confirmationFeedback =
    confirmationError || errors.password_confirmation?.[0];
  const matches = Boolean(
    values.password && values.confirmation && !validation.confirmation,
  );

  function readValues() {
    const next = {
      password: passwordInput.current.value,
      confirmation: confirmationInput.current.value,
    };
    setValues(next);
    onActiveChange?.(next.password !== "" || next.confirmation !== "");
    onEdit?.();
  }

  useEffect(() => {
    passwordInput.current.setCustomValidity(validation.password);
    confirmationInput.current.setCustomValidity(validation.confirmation);
  }, [validation.password, validation.confirmation]);

  useEffect(() => {
    const form = passwordInput.current.form;
    function reset() {
      passwordInput.current.setCustomValidity("");
      confirmationInput.current.setCustomValidity("");
      setValues({ password: "", confirmation: "" });
      setTouched({ password: false, confirmation: false });
      setReveal(false);
      onActiveChange?.(false);
    }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [onActiveChange]);

  return (
    <div className="new-password-fields">
      <div className="password-field">
        <Field
          id={passwordId}
          ref={passwordInput}
          label={passwordLabel}
          name="password"
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          minLength={12}
          required={validation.active}
          onChange={readValues}
          onBlur={() =>
            setTouched((current) => ({ ...current, password: true }))
          }
          error={errors.password?.[0]}
          aria-invalid={
            Boolean(passwordFeedback && validation.password) ||
            Boolean(errors.password?.[0])
          }
          aria-describedby={[
            rulesId,
            statusId,
            errors.password?.[0] && `${passwordId}-help`,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={
            reveal
              ? "Hide new password and confirmation"
              : "Show new password and confirmation"
          }
          aria-pressed={reveal}
          onClick={() => setReveal((current) => !current)}
        >
          {reveal ? (
            <EyeOff size={19} aria-hidden="true" />
          ) : (
            <Eye size={19} aria-hidden="true" />
          )}
        </button>
      </div>
      <div className="password-requirements" id={rulesId}>
        <span className="password-requirements-label">
          Password requirements
        </span>
        <ul>
          {validation.requirements.map((rule) => (
            <li key={rule.id} data-met={rule.met}>
              {rule.met ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Circle size={14} aria-hidden="true" />
              )}
              <span>
                <span className="sr-only">
                  {rule.met ? "Met: " : "Needed: "}
                </span>
                {rule.label}
              </span>
            </li>
          ))}
        </ul>
        <p
          id={statusId}
          className="password-live-status"
          data-state={validation.password ? "incomplete" : "valid"}
          role="status"
          aria-atomic="true"
        >
          {passwordFeedback}
        </p>
      </div>
      <div
        className="password-confirmation-feedback"
        data-state={matches ? "valid" : "incomplete"}
      >
        <Field
          id={confirmationId}
          ref={confirmationInput}
          label={confirmationLabel}
          name="password_confirmation"
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          required={validation.active}
          onChange={readValues}
          onBlur={() =>
            setTouched((current) => ({ ...current, confirmation: true }))
          }
          error={
            confirmationFeedback ? (
              <span role="status">{confirmationFeedback}</span>
            ) : undefined
          }
          hint={
            matches ? <span role="status">Passwords match.</span> : undefined
          }
        />
      </div>
    </div>
  );
}
