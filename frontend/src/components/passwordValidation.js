// Match the existing Laravel Password::min(12)->mixedCase()->numbers()->symbols()
// policy, including Unicode letters/numbers and its accepted symbol/space classes.
export function passwordRequirements(password = "") {
  return [
    {
      id: "length",
      label: "12 or more characters",
      met: Array.from(password).length >= 12,
    },
    {
      id: "uppercase",
      label: "An uppercase letter",
      met: /\p{Lu}/u.test(password),
    },
    {
      id: "lowercase",
      label: "A lowercase letter",
      met: /\p{Ll}/u.test(password),
    },
    { id: "number", label: "A number", met: /\p{N}/u.test(password) },
    {
      id: "symbol",
      label: "A symbol or space (for example ! @ #)",
      met: /[\p{Z}\p{S}\p{P}]/u.test(password),
    },
  ];
}

export function passwordPairValidation(
  password,
  confirmation,
  optional = false,
) {
  const active = !optional || password !== "" || confirmation !== "";
  const requirements = passwordRequirements(password);
  const missing = requirements.filter((rule) => !rule.met);
  return {
    active,
    requirements,
    password: !active
      ? ""
      : !password
        ? "Enter a password."
        : missing.length
          ? `Password still needs: ${missing.map((rule) => rule.label.toLowerCase()).join(", ")}.`
          : "",
    confirmation: !active
      ? ""
      : !confirmation
        ? "Confirm your password."
        : password !== confirmation
          ? "Passwords do not match."
          : "",
  };
}

// Read the actual form values as a final client check, including autofilled values.
// The API retains authoritative password, current-password and confirmation checks.
export function validateNewPasswordForm(form, { optional = false } = {}) {
  const password = form.elements.namedItem("password");
  const confirmation = form.elements.namedItem("password_confirmation");
  if (!password || !confirmation) return form.reportValidity();
  const validation = passwordPairValidation(
    password.value,
    confirmation.value,
    optional,
  );
  password.setCustomValidity(validation.password);
  confirmation.setCustomValidity(validation.confirmation);
  return form.reportValidity();
}
