import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { api } from "../api";
import { useConfirm } from "./ConfirmProvider";
import { Button, EmptyState, Feedback, Skeleton } from "./ui";
import { DeliveryAddressPicker } from "./DeliveryAddressPicker";
import "./savedDeliveryAddresses.css";

export default function SavedDeliveryAddresses({ user }) {
  const confirm = useConfirm();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const heading = useRef(null);
  const editorHeading = useRef(null);
  const request = useRef(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await api("/addresses", { signal: controller.signal });
      if (!controller.signal.aborted) setAddresses(result.data || []);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure.message || "Could not load your saved addresses.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    if (editor) editorHeading.current?.focus();
  }, [Boolean(editor)]);

  function edit(address) {
    setNotice("");
    setError("");
    setEditor(
      address
        ? {
            ...address,
            address_record_id: address.id,
            delivery_address_id: address.id,
            pin_confirmed: true,
          }
        : {
            label: "Home",
            recipient_name: user.name,
            phone: "",
            is_default: addresses.length === 0,
          },
    );
  }
  function close() {
    setEditor(null);
    heading.current?.focus();
  }
  async function makeDefault(address) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/addresses/${address.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...address, is_default: true }),
      });
      await load();
      setNotice(`${address.label} is now your default delivery address.`);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(address) {
    if (busy) return;
    const approved = await confirm(
      `Remove ${address.label} from your saved delivery addresses? Previous orders will keep their delivery details.`,
      {
        title: "Delete saved address?",
        confirmLabel: "Delete address",
        destructive: true,
      },
    );
    if (!approved) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/addresses/${address.id}`, { method: "DELETE" });
      await load();
      setNotice(`${address.label} was removed from your saved addresses.`);
      heading.current?.focus();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="delivery-addresses"
      className="saved-delivery-addresses"
      aria-labelledby="saved-addresses-heading"
    >
      <header className="saved-addresses-heading">
        <div>
          <h2 id="saved-addresses-heading" ref={heading} tabIndex={-1}>
            Saved delivery addresses
          </h2>
          <p>
            Set up Home, Work, or another location now. No order needed. Your
            default fills in automatically when you choose Delivery.
          </p>
        </div>
        {!editor && (
          <Button onClick={() => edit()} disabled={busy || loading}>
            <Plus size={17} aria-hidden="true" />
            Add address
          </Button>
        )}
      </header>
      {error && (
        <Feedback onRetry={!editor ? load : undefined}>{error}</Feedback>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {editor ? (
        <div className="saved-address-editor">
          <div className="saved-addresses-heading">
            <h3 ref={editorHeading} tabIndex={-1}>
              {editor.address_record_id
                ? "Edit saved address"
                : "Add a delivery address"}
            </h3>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
          <DeliveryAddressPicker
            value={editor}
            onChange={setEditor}
            mode="addressBook"
            onSavingChange={setBusy}
            onSaved={(saved) => {
              close();
              setNotice(
                `${saved.label} saved${saved.is_default ? " as your default delivery address" : ""}.`,
              );
              load();
            }}
          />
        </div>
      ) : loading ? (
        <Skeleton cards={1} label="Loading saved addresses" />
      ) : !error && addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Your delivery locations, ready for next time"
          description="Save an address and entrance pin once, then reuse them whenever you order delivery."
          action="Add your first address"
          onAction={() => edit()}
        />
      ) : (
        <div className="saved-address-grid">
          {addresses.map((address) => (
            <article
              key={address.id}
              className="saved-address-card"
              aria-label={`${address.label} delivery address`}
            >
              <div className="saved-address-card-title">
                <h3>
                  <MapPin size={18} aria-hidden="true" />
                  {address.label}
                </h3>
                {address.is_default && (
                  <span className="saved-address-default">Default</span>
                )}
              </div>
              <p>{address.formatted_address}</p>
              <p className="saved-address-contact">
                {address.recipient_name} · {address.phone}
              </p>
              {address.delivery_instructions && (
                <p className="saved-address-contact">
                  {address.delivery_instructions}
                </p>
              )}
              <div className="saved-address-actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => edit(address)}
                  aria-label={`Edit ${address.label}`}
                >
                  Edit
                </Button>
                {!address.is_default && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => makeDefault(address)}
                    aria-label={`Set ${address.label} as default`}
                  >
                    Set as default
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => remove(address)}
                  aria-label={`Delete ${address.label}`}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
