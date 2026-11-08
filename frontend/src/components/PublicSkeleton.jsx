import { UtensilsCrossed } from "lucide-react";
import { AuthStory } from "./AuthScreen";
import "../features/publicLanding.css";
import "./publicSkeleton.css";

const AUTH_FIELDS = { login: 2, register: 4, forgot: 1 };
const LABELS = {
  landing: "Loading restaurant",
  login: "Loading sign in",
  register: "Loading create account",
  forgot: "Loading password recovery",
};
const many = (count, render) =>
  Array.from({ length: count }, (_, index) => render(index));

function LandingSkeleton() {
  return (
    <div className="public-landing" role="status" aria-label={LABELS.landing}>
      <header className="public-header" aria-hidden="true">
        <span className="public-brand">
          <span className="brand-mark">
            <UtensilsCrossed size={22} />
          </span>
          <div className="public-brand-identity">
            <strong>
              DineFlow<i>.</i>
            </strong>
          </div>
        </span>
        <div className="pub-skel-nav">
          <i className="pub-skel" />
          <i className="pub-skel" />
          <i className="pub-skel pub-skel-sign-in" />
        </div>
      </header>
      <main id="public-main">
        <section className="public-hero" aria-hidden="true">
          <div className="pub-skel-copy">
            <i className="pub-skel pub-skel-title" />
            <i className="pub-skel pub-skel-title short" />
            <i className="pub-skel pub-skel-line" />
            <i className="pub-skel pub-skel-line short" />
            <span>
              <i className="pub-skel pub-skel-button" />
              <i className="pub-skel pub-skel-button" />
            </span>
          </div>
          <i className="pub-skel pub-skel-art" />
        </section>
        <section className="public-menu" aria-hidden="true">
          <div className="public-dish-grid">
            {many(6, (index) => (
              <div key={index} className="pub-skel-card">
                <i className="pub-skel pub-skel-thumb" />
                <i className="pub-skel pub-skel-line short" />
                <i className="pub-skel pub-skel-line" />
                <span>
                  <i className="pub-skel pub-skel-line price" />
                  <i className="pub-skel pub-skel-order" />
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function AuthSkeleton({ mode }) {
  return (
    <div className="production-auth">
      <main className="auth-layout" role="status" aria-label={LABELS[mode]}>
        <AuthStory />
        <div className="auth-form-area" aria-hidden="true">
          <div className="auth-form-wrap pub-skel-form" data-mode={mode}>
            <i className="pub-skel pub-skel-line eyebrow" />
            <i className="pub-skel pub-skel-heading" />
            <i className="pub-skel pub-skel-line" />
            {many(AUTH_FIELDS[mode], (index) => (
              <span key={index} className="pub-skel-field">
                <i className="pub-skel pub-skel-line label" />
                <i className="pub-skel pub-skel-input" />
              </span>
            ))}
            {mode === "login" && (
              <span className="pub-skel-remember">
                <i className="pub-skel pub-skel-line label" />
                <i className="pub-skel pub-skel-line label" />
              </span>
            )}
            <i className="pub-skel pub-skel-input" />
            <i className="pub-skel pub-skel-line switch" />
          </div>
        </div>
      </main>
    </div>
  );
}

/** The signed-out pages while they load, shaped like the page itself. */
export function PublicSkeleton({ variant }) {
  return variant === "landing" ? (
    <LandingSkeleton />
  ) : (
    <AuthSkeleton mode={variant} />
  );
}
