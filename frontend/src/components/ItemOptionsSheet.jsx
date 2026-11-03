import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Field } from "./ui";

const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mobile item options: a bottom sheet with radio sizes and add-on toggles in
// place of an inline <select>. Field names match the desktop card form so the
// same add handler reads both.
export function ItemOptionsSheet({ item, open, onClose, onAdd }) {
  const dialog = useRef(null);
  const id = useId();
  const [variantId, setVariantId] = useState("");
  const [addonIds, setAddonIds] = useState([]);
  const [sizeError, setSizeError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setVariantId("");
      setAddonIds([]);
      setSizeError("");
      element.showModal?.();
    } else if (!open && element.open) element.close?.();
  }, [open]);

  const variants = item.variants || [];
  const addons = item.addons || [];
  const total =
    Number(item.base_price) +
    Number(
      variants.find((variant) => String(variant.id) === variantId)
        ?.price_adjustment || 0,
    ) +
    addonIds.reduce(
      (sum, addonId) =>
        sum + Number(addons.find((addon) => addon.id === addonId)?.price || 0),
      0,
    );

  return (
    <dialog
      ref={dialog}
      className="df-sheet customer-item-sheet"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (variants.length && !variantId) {
            setSizeError("Choose a size to continue.");
            return;
          }
          onAdd(item, event);
          onClose();
        }}
      >
        <header className="customer-item-sheet-heading">
          <div>
            <span className="eyebrow">
              {item.category?.name || "From our kitchen"}
            </span>
            <h2 id={`${id}-title`}>{item.name}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close options"
            onClick={onClose}
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <div className="customer-item-sheet-body">
          {variants.length > 0 && (
            <fieldset
              className="customer-size-options"
              aria-describedby={sizeError ? `${id}-size-error` : undefined}
              aria-invalid={sizeError ? true : undefined}
            >
              <legend>
                Size <span>Required</span>
              </legend>
              <div className="df-segmented">
                {variants.map((variant) => (
                  <label key={variant.id}>
                    <input
                      type="radio"
                      name="variant_id"
                      value={variant.id}
                      checked={variantId === String(variant.id)}
                      onChange={(event) => {
                        setVariantId(event.target.value);
                        setSizeError("");
                      }}
                    />
                    <span>
                      {variant.name}
                      {Number(variant.price_adjustment) ? (
                        <small>+{money(variant.price_adjustment)}</small>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              {sizeError && (
                <small
                  id={`${id}-size-error`}
                  className="field-error"
                  role="alert"
                >
                  {sizeError}
                </small>
              )}
            </fieldset>
          )}
          {addons.length > 0 && (
            <fieldset className="customer-addon-options">
              <legend>
                Make it yours <span>Optional</span>
              </legend>
              {addons.map((addon) => (
                <label className="df-toggle-row" key={addon.id}>
                  <span>
                    {addon.name}
                    <small>+{money(addon.price)}</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    name="addon_ids"
                    value={addon.id}
                    checked={addonIds.includes(addon.id)}
                    onChange={(event) =>
                      setAddonIds((current) =>
                        event.target.checked
                          ? [...current, addon.id]
                          : current.filter((value) => value !== addon.id),
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
          )}
          <Field
            label="Special instructions"
            name="special_instructions"
            maxLength={500}
            placeholder="Any preferences?"
          />
        </div>
        <div className="df-bottom-bar">
          <Button type="submit">
            <Plus size={17} aria-hidden="true" />
            Add to order · {money(total)}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
