import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  eyebrow = "RESTAURANT CATALOG",
  closeLabel = "Close editor",
  className = "",
}) {
  const dialog = useRef(null),
    id = useId();
  useEffect(() => {
    if (open && !dialog.current.open) {
      dialog.current.showModal();
      // Desktop: start typing in the form, not on the close button.
      if (window.matchMedia?.("(min-width: 1024px)")?.matches)
        dialog.current
          .querySelector("form :is(input, select, textarea)")
          ?.focus();
    } else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={`editor-modal ${className}`.trim()}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={`${id}-title`}>{title}</h2>
          {description && <p id={`${id}-description`}>{description}</p>}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X size={21} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
