import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Eye,
  EyeOff,
  UtensilsCrossed,
} from "lucide-react";
import { api, csrf } from "../api";
import { Button, Feedback, Field } from "./ui";

const titles = {
  login: "Welcome back.",
  register: "A seat at the table.",
  forgot: "Let’s get you back in.",
  reset: "A fresh start.",
};
const descriptions = {
  login: "Good food. Great company. Everything you need, in one place.",
  register:
    "Create your customer account to order your favorites and plan your next visit.",
  forgot:
    "Enter your email and we’ll send instructions to reset your password.",
  reset: "Choose a strong password to keep your account secure.",
};

export function AuthScreen({ onSignedIn }) {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState(params.has("token") ? "reset" : "login");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  function changeMode(value) {
    setMode(value);
    setError("");
    setErrors({});
    setMessage("");
    setReveal(false);
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    setErrors({});
    setMessage("");
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await csrf();
      if (mode === "forgot") {
        await api("/forgot-password", {
          method: "POST",
          body: JSON.stringify(values),
        });
        setMessage(
          "If the account exists, recovery instructions will be sent.",
        );
      } else if (mode === "reset") {
        await api("/reset-password", {
          method: "POST",
          body: JSON.stringify({ ...values, token: params.get("token") }),
        });
        changeMode("login");
        setMessage("Password reset. You can sign in now.");
      } else {
        const result = await api(mode === "register" ? "/register" : "/login", {
          method: "POST",
          body: JSON.stringify(values),
        });
        onSignedIn(result.user);
      }
    } catch (failure) {
      setError(failure.message);
      setErrors(failure.errors || {});
    } finally {
      setBusy(false);
    }
  }
  const action = {
    login: "Sign in",
    register: "Create customer account",
    forgot: "Send recovery link",
    reset: "Reset password",
  }[mode];
  return (
    <main className="auth-layout">
      <aside className="auth-story" aria-label="Welcome to DineFlow">
        <div className="auth-wordmark">
          <span className="brand-mark">
            <UtensilsCrossed size={22} aria-hidden="true" />
          </span>
          DineFlow<span className="wordmark-dot">.</span>
        </div>
        <div className="auth-story-copy">
          <span className="eyebrow">MADE FOR GOOD MOMENTS</span>
          <h2>
            Less waiting.
            <br />
            More savoring.
          </h2>
          <p>
            Your next favorite meal starts here. Discover the menu, find your
            table, and leave the rest to us.
          </p>
          <div className="table-illustration" aria-hidden="true">
            <div className="plate-orbit orbit-one" />
            <div className="plate-orbit orbit-two" />
            <div className="illustration-plate">
              <UtensilsCrossed size={76} strokeWidth={1} />
            </div>
            <span className="illustration-tag">
              <CalendarDays size={18} />A table for every occasion
            </span>
            <i className="table-chair chair-one" />
            <i className="table-chair chair-two" />
          </div>
        </div>
        <p className="auth-story-footer">
          Thoughtful dining, from the first click.
        </p>
      </aside>
      <div className="auth-form-area">
        <a className="auth-mobile-brand" href="/">
          DineFlow<span>.</span>
        </a>
        <div className="auth-form-wrap">
          <span className="eyebrow">
            {mode === "login"
              ? "YOUR RESTAURANT, CONNECTED"
              : "YOUR DINEFLOW ACCOUNT"}
          </span>
          <h1>{titles[mode]}</h1>
          <p className="auth-intro">{descriptions[mode]}</p>
          <form
            key={mode}
            onSubmit={submit}
            className="auth-form"
            aria-busy={busy}
          >
            {mode === "register" && (
              <Field
                label="Name"
                name="name"
                autoComplete="name"
                maxLength={120}
                required
                error={errors.name?.[0]}
              />
            )}
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              defaultValue={params.get("email") || ""}
              required
              error={errors.email?.[0]}
            />
            {mode !== "forgot" && (
              <div className="password-field">
                <Field
                  label="Password"
                  name="password"
                  type={reveal ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? undefined : 12}
                  required
                  error={errors.password?.[0]}
                  hint={
                    mode === "register" || mode === "reset"
                      ? "At least 12 characters with uppercase, lowercase, a number and a symbol."
                      : undefined
                  }
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  aria-pressed={reveal}
                >
                  {reveal ? (
                    <EyeOff size={19} aria-hidden="true" />
                  ) : (
                    <Eye size={19} aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
            {["register", "reset"].includes(mode) && (
              <Field
                label="Confirm password"
                name="password_confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            )}
            {mode === "login" && (
              <button
                className="text-button recovery-link"
                type="button"
                onClick={() => changeMode("forgot")}
              >
                Forgot password?
              </button>
            )}
            {error && <Feedback>{error}</Feedback>}
            {message && <Feedback tone="success">{message}</Feedback>}
            <Button type="submit" busy={busy} className="auth-submit">
              {busy ? "Please wait…" : action}
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </Button>
          </form>
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                <span>New to the table?</span>
                <button
                  className="text-button"
                  onClick={() => changeMode("register")}
                >
                  Create customer account
                </button>
              </>
            ) : (
              <button
                className="text-button"
                onClick={() => changeMode("login")}
              >
                Back to sign in
              </button>
            )}
          </div>
          <p className="auth-fineprint">
            For customers and restaurant teams. Staff access is provided by your
            restaurant administrator.
          </p>
        </div>
        <footer className="auth-footer">
          DineFlow · A little more time for what matters.
        </footer>
      </div>
    </main>
  );
}
