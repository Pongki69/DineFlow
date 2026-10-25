import { ChevronDown } from "lucide-react";

export function TrackingDisclosureSummary({ children, meta }) {
  return (
    <summary className="tracking-disclosure-summary">
      <span className="tracking-disclosure-title">{children}</span>
      <span className="tracking-disclosure-action">
        {meta && <small>{meta}</small>}
        <ChevronDown size={18} aria-hidden="true" />
      </span>
    </summary>
  );
}
