import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Button, Field } from "./ui";

const PromptContext = createContext(null);
const ConfirmContext = createContext(null);

// Native dialog supplies focus containment, Escape handling and focus restoration.
export function ConfirmProvider({ children }) {
  const dialog = useRef(null);
  const resolver = useRef(null);
  const [request, setRequest] = useState(null);
  useEffect(() => {
    if (request) dialog.current?.showModal();
  }, [request]);
  useEffect(() => () => resolver.current?.(null), []);
  function finish(value) {
    dialog.current?.close();
    setRequest(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(value);
  }
  function confirm(message, options = {}) {
    resolver.current?.(null);
    dialog.current?.close();
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest({
        kind: "confirm",
        message,
        title: options.title || "Confirm this action",
        confirmLabel: options.confirmLabel || "Continue",
        destructive: Boolean(options.destructive),
      });
    });
  }
  function requestPrompt(message, defaultValue = "", options = {}) {
    resolver.current?.(null);
    dialog.current?.close();
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest({ kind: "prompt", message, defaultValue, ...options });
    });
  }
  return (
    <PromptContext.Provider value={requestPrompt}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <dialog
          ref={dialog}
          className={`action-dialog${request?.description ? " action-dialog--detailed" : ""}`}
          aria-labelledby="action-dialog-title"
          aria-describedby={
            request?.kind === "confirm" || request?.description
              ? "action-dialog-description"
              : undefined
          }
          onCancel={(event) => {
            event.preventDefault();
            finish(null);
          }}
        >
          <form
            key={request?.message}
            onSubmit={(event) => {
              event.preventDefault();
              finish(
                request?.kind === "confirm"
                  ? true
                  : new FormData(event.currentTarget).get("value"),
              );
            }}
          >
            <span className="eyebrow">
              {request?.kind === "confirm"
                ? "PLEASE CONFIRM"
                : "RESTAURANT WORKSPACE"}
            </span>
            <h2 id="action-dialog-title">
              {request?.kind === "confirm" ? request.title : request?.message}
            </h2>
            {request?.description && (
              <p id="action-dialog-description">{request.description}</p>
            )}
            {request?.kind === "confirm" ? (
              <p
                id="action-dialog-description"
                className="action-dialog-description"
              >
                {request.message}
              </p>
            ) : (
              <Field
                label={request?.label || "Your response"}
                name="value"
                type={
                  /^\d{4}-\d{2}-\d{2}T/.test(
                    String(request?.defaultValue || ""),
                  )
                    ? "datetime-local"
                    : "text"
                }
                defaultValue={request?.defaultValue}
                required={request?.required}
                minLength={request?.minLength}
                maxLength={request?.maxLength}
                autoFocus
              >
                {request?.multiline ? <textarea rows={3} /> : undefined}
              </Field>
            )}
            {request?.confirmationLabel && (
              <label className="action-dialog-confirmation">
                <input type="checkbox" required />{" "}
                <span>{request.confirmationLabel}</span>
              </label>
            )}
            <div className="dialog-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  finish(request?.kind === "confirm" ? false : null)
                }
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={request?.destructive ? "dialog-confirm--danger" : ""}
              >
                {request?.confirmLabel || "Continue"}
              </Button>
            </div>
          </form>
        </dialog>
      </ConfirmContext.Provider>
    </PromptContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm requires ConfirmProvider");
  return confirm;
}

export function usePrompt() {
  const ask = useContext(PromptContext);
  if (!ask) throw new Error("usePrompt requires ConfirmProvider");
  return ask;
}
