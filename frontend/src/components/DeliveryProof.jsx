import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Camera, CheckCircle2 } from "lucide-react";
import { Button } from "./ui";
import "./deliveryProof.css";

export async function prepareDeliveryPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG or WebP photo.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 20 MB.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Could not prepare this photo. Please try another image.",
      );
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78),
    );
    if (!blob || blob.size > 1024 * 1024)
      throw new Error(
        "This photo is too detailed to upload. Try a smaller image.",
      );
    return new File([blob], "delivery-photo.jpg", { type: "image/jpeg" });
  } finally {
    image.close();
  }
}

export function DeliveryProofUpload({ deliveryId, uploaded, onUploaded }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const selection = useRef(0);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(
    () => () => {
      selection.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!uploaded) {
      setUploadedPhoto("");
      return;
    }
    const controller = new AbortController();
    setPhotoLoading(true);
    api(`/deliveries/${deliveryId}/proof`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted)
          setUploadedPhoto(result.data?.image || "");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            `Photo uploaded, but its preview could not be loaded: ${e.message}`,
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPhotoLoading(false);
      });
    return () => controller.abort();
  }, [deliveryId, uploaded]);
  async function choose(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const version = ++selection.current;
    setError("");
    setBusy(true);
    setPhase("preparing");
    setFile(null);
    try {
      const prepared = await prepareDeliveryPhoto(selected);
      if (version === selection.current) setFile(prepared);
    } catch (e) {
      if (version === selection.current)
        setError(
          e.message || "Could not read this photo. Choose another image.",
        );
    } finally {
      if (version === selection.current) {
        setBusy(false);
        setPhase("");
      }
    }
  }
  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setPhase("uploading");
    setError("");
    try {
      const body = new FormData();
      body.append("photo", file);
      await api(`/rider/deliveries/${deliveryId}/proof`, {
        method: "POST",
        body,
      });
      setFile(null);
      setError("");
      onUploaded();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setPhase("");
    }
  }
  return (
    <section
      className="delivery-proof"
      aria-label="Delivery photo"
      aria-busy={busy}
    >
      <div className="delivery-proof-heading">
        <h3>Delivery photo</h3>
        <span>
          {uploaded
            ? "Saved"
            : phase === "uploading"
              ? "Uploading"
              : phase === "preparing"
                ? "Preparing"
                : preview
                  ? "Ready to upload"
                  : "Required"}
        </span>
      </div>
      <p>
        Photograph the food at the drop-off. Avoid faces and personal documents.
      </p>
      {uploaded ? (
        <>
          <div className="delivery-proof-result">
            {photoLoading && <p role="status">Loading uploaded photo…</p>}
            {uploadedPhoto && (
              <img
                className="delivery-proof-image"
                src={uploadedPhoto}
                alt="Uploaded delivery proof photo"
              />
            )}
            <p role="status" className="delivery-proof-saved">
              <CheckCircle2 size={16} aria-hidden="true" /> Uploaded proof photo
            </p>
          </div>
        </>
      ) : (
        <>
          <label
            className="delivery-photo-picker"
            htmlFor={`delivery-photo-${deliveryId}`}
            aria-disabled={busy}
          >
            <Camera size={24} aria-hidden="true" />
            <span>
              {preview ? "Choose a different photo" : "Take or choose a photo"}
              <small>JPG, PNG or WebP</small>
            </span>
            <input
              className="sr-only"
              id={`delivery-photo-${deliveryId}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={busy}
              onChange={choose}
            />
          </label>
          <small>
            {preview
              ? "Upload to enable Mark delivered · maximum 1 MB."
              : "Photos are resized to a maximum of 1 MB."}
          </small>
          {preview && (
            <div className="delivery-proof-result is-pending-upload">
              <img
                className="delivery-proof-image"
                src={preview}
                alt="Delivery photo preview"
              />
              <div className="delivery-proof-result-copy">
                <span className="delivery-proof-file-status">
                  <strong>Photo ready</strong>
                  <small>{(file.size / 1024).toFixed(0)} KB · JPG</small>
                </span>
                {file && (
                  <Button type="button" disabled={busy} onClick={upload}>
                    {phase === "uploading"
                      ? "Uploading photo…"
                      : "Upload delivery photo"}
                  </Button>
                )}
              </div>
            </div>
          )}
          {phase === "preparing" && <p role="status">Preparing photo…</p>}
        </>
      )}
      {phase === "uploading" && <p role="status">Photo upload in progress.</p>}
      {error && (
        <p role="alert" className="delivery-proof-error">
          {error}
        </p>
      )}
    </section>
  );
}

export function DeliveryProofPhoto({ deliveryId }) {
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function view() {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/deliveries/${deliveryId}/proof`);
      setPhoto(result.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="delivery-proof" aria-label="Proof of delivery">
      <div className="tracking-card-heading">
        <h2>Delivery photo</h2>
        <button
          type="button"
          disabled={busy}
          onClick={photo ? () => setPhoto(null) : view}
        >
          {photo
            ? "Hide delivery photo"
            : busy
              ? "Loading photo…"
              : "View delivery photo"}
        </button>
      </div>
      {photo && (
        <img
          className="delivery-proof-image"
          src={photo.image}
          alt="Photo of your delivered order"
        />
      )}
      {error && (
        <p role="alert" className="delivery-proof-error">
          {error}
        </p>
      )}
    </section>
  );
}
