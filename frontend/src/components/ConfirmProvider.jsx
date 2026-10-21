import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Button, Field } from "./ui";

const PromptContext = createContext(null);

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
  function ask(message, defaultValue = "") {
    resolver.current?.(null);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest({ message, defaultValue });
    });
  }
  return (
    <PromptContext.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        className="action-dialog"
        aria-labelledby="action-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          finish(null);
        }}
      >
        <form
          key={request?.message}
          onSubmit={(event) => {
            event.preventDefault();
            finish(new FormData(event.currentTarget).get("value"));
          }}
        >
          <span className="eyebrow">RESTAURANT WORKSPACE</span>
          <h2 id="action-dialog-title">{request?.message}</h2>
          <Field
            label="Your response"
            name="value"
            type={
              /^\d{4}-\d{2}-\d{2}T/.test(String(request?.defaultValue || ""))
                ? "datetime-local"
                : "text"
            }
            defaultValue={request?.defaultValue}
            autoFocus
          />
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      </dialog>
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const ask = useContext(PromptContext);
  if (!ask) throw new Error("usePrompt requires ConfirmProvider");
  return ask;
}
