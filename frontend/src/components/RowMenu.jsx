import { useEffect, useId, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";
import "./rowMenu.css";

/**
 * A row's secondary actions behind one vertical "⋮" button.
 *
 * items: [{ key, label, icon, tone: "danger" | undefined, onSelect }].
 * Opens below the button, aligned right; Escape, a click outside or picking
 * an option closes it. Arrow keys move between options.
 */
export function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    root.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!items.length) return null;
  function move(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const options = [...root.current.querySelectorAll('[role="menuitem"]')];
    const at = options.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (at + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length;
    options[next]?.focus();
  }
  return (
    <div className="row-menu" ref={root} data-open={open || undefined}>
      <button
        ref={trigger}
        type="button"
        className="row-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="More actions"
        onClick={() => setOpen((value) => !value)}
      >
        <EllipsisVertical size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          className="row-menu-list"
          role="menu"
          aria-label={label}
          onKeyDown={move}
        >
          {items.map(({ key, label: text, icon: Icon, tone, onSelect }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              data-tone={tone}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onSelect();
              }}
            >
              {Icon && <Icon size={16} aria-hidden="true" />}
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
