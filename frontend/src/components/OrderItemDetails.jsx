import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { Modal } from "./Modal";
import "./orderItemDetails.css";

const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value || 0),
  );

function ItemPhoto({ item }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="order-item-photo">
      {item.image_url && !failed ? (
        <img
          src={item.image_url}
          alt={item.item_name_snapshot}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="order-item-no-photo">
          <UtensilsCrossed size={42} strokeWidth={1.3} aria-hidden="true" />
          <span>No photo available</span>
        </div>
      )}
    </div>
  );
}

export function OrderItemDetails({ item, onClose }) {
  return (
    <Modal
      open={Boolean(item)}
      title={item?.item_name_snapshot || "Order item"}
      eyebrow="ORDER ITEM"
      closeLabel="Close item details"
      onClose={onClose}
    >
      {item && (
        <div className="order-item-detail">
          <ItemPhoto key={item.id} item={item} />
          <section aria-label="Item description">
            <h3>Description</h3>
            <p>
              {item.description ||
                "A description is no longer available for this item."}
            </p>
          </section>
          <dl className="order-item-purchase">
            <div>
              <dt>Quantity ordered</dt>
              <dd>{item.quantity}</dd>
            </div>
            {item.variant_name_snapshot && (
              <div>
                <dt>Option</dt>
                <dd>{item.variant_name_snapshot}</dd>
              </div>
            )}
            {!!item.addons?.length && (
              <div>
                <dt>Add-ons</dt>
                <dd>
                  {item.addons
                    .map(
                      (addon) =>
                        addon.addon_name_snapshot ||
                        addon.name_snapshot ||
                        "Add-on",
                    )
                    .join(", ")}
                </dd>
              </div>
            )}
            <div>
              <dt>Item total</dt>
              <dd>{money(item.line_total)}</dd>
            </div>
          </dl>
          {item.special_instructions && (
            <section>
              <h3>Item instructions</h3>
              <p>{item.special_instructions}</p>
            </section>
          )}
          <small className="order-item-catalog-note">
            Photo and description reflect the menu information currently
            available. Order options and prices are from this order.
          </small>
        </div>
      )}
    </Modal>
  );
}
