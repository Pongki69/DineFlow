import { createContext, useContext } from "react";

/*
 * Admin workspace · desktop building blocks (1024px and wider).
 *
 * The admin shell provides `true` at desktop widths, so pages can render the
 * shared desktop header and icon tiles there while phones and tablets keep
 * their markup exactly as it was. Styles live in adminDesktop.css.
 */
export const AdminDesktopContext = createContext(false);

/** True inside the admin workspace shell at 1024px and wider. */
export function useAdminDesktop() {
  return useContext(AdminDesktopContext);
}

/** Square icon tile used by card headers and stat tiles on desktop. */
export function DeskIcon({ icon: Icon, className = "" }) {
  const desktop = useAdminDesktop();
  if (!desktop || !Icon) return null;
  return (
    <i
      className={`ad-icon${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <Icon size={18} strokeWidth={1.75} />
    </i>
  );
}

/** Stat tile icon: sits in the tile's top-right corner, like the Dashboard. */
export function StatIcon({ icon }) {
  return <DeskIcon icon={icon} className="ad-stat-icon" />;
}

/**
 * The one card header on desktop: icon tile, title, optional description
 * and actions on the right, with a divider below.
 */
export function CardHeading({
  icon,
  title,
  description,
  actions,
  id,
  as: Heading = "h2",
}) {
  return (
    <header className="ad-card-head">
      <DeskIcon icon={icon} />
      <div className="ad-card-head-text">
        <Heading id={id}>{title}</Heading>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ad-card-head-actions">{actions}</div>}
    </header>
  );
}
