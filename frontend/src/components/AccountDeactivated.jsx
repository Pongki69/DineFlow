import { Link } from "react-router-dom";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import "./accountDeactivated.css";

/**
 * Shown when an account is turned off: at sign-in with the right password,
 * or when it is deactivated while someone is using it. Nothing is lost -
 * the account just can't be used until the restaurant turns it back on.
 */
export function AccountDeactivated() {
  return (
    <main className="account-off" aria-labelledby="account-off-title">
      <section className="account-off-card">
        <div className="account-off-brand">
          DineFlow<span>.</span>
        </div>
        <span className="account-off-icon" aria-hidden="true">
          <LockKeyhole size={28} />
        </span>
        <h1 id="account-off-title">This account is turned off</h1>
        <p className="account-off-lead">
          The restaurant has deactivated this account, so it can’t sign in,
          order or book a table right now. You’ve been signed out on this
          device.
        </p>
        <ul className="account-off-points">
          <li>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>Nothing is deleted.</strong> Your orders, bookings and
              details are kept and come back when the account is turned on
              again.
            </span>
          </li>
          <li>
            <Mail size={18} aria-hidden="true" />
            <span>
              <strong>Need it back?</strong> Contact the restaurant, or your
              manager if this is a staff account, and ask them to reactivate it.
            </span>
          </li>
        </ul>
        <div className="account-off-actions">
          <Link to="/login" replace className="account-off-primary">
            Back to sign in
          </Link>
          <Link to="/" className="account-off-secondary">
            Go to the home page
          </Link>
        </div>
      </section>
    </main>
  );
}
