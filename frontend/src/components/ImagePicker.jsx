import { useEffect, useId, useRef, useState } from "react";

export function ImagePicker({
  label = "Image (optional)",
  name = "image",
  urlName = "image_source_url",
  initialUrl = "",
  initialSourceUrl = "",
  error,
}) {
  const id = useId();
  const urlInput = useRef(null);
  const [source, setSource] = useState(initialSourceUrl ? "link" : "device");
  const [url, setUrl] = useState(initialSourceUrl);
  const [file, setFile] = useState(null);
  const [devicePreview, setDevicePreview] = useState("");
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    if (!file) {
      setDevicePreview("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setDevicePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  let linkPreview = "";
  try {
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol))
      linkPreview = parsed.href;
  } catch {
    /* Preview starts once a valid URL has been entered. */
  }
  const preview = source === "link" ? linkPreview : devicePreview || initialUrl;
  return (
    <fieldset className="image-picker">
      <legend>{label}</legend>
      <div
        className="image-picker-sources"
        role="group"
        aria-label="Image source"
      >
        {["device", "link"].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={source === option}
            onClick={() => {
              setSource(option);
              setFile(null);
              setPreviewError("");
            }}
          >
            {option === "device" ? "From device" : "From link"}
          </button>
        ))}
      </div>
      {source === "device" ? (
        <div className="ui-field">
          <label htmlFor={`${id}-file`}>Choose an image</label>
          <input
            id={`${id}-file`}
            type="file"
            name={name}
            accept="image/jpeg,image/png,image/webp"
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreviewError("");
            }}
          />
        </div>
      ) : (
        <div className="ui-field">
          <label htmlFor={`${id}-url`}>Image link</label>
          <input
            ref={urlInput}
            id={`${id}-url`}
            type="url"
            name={urlName}
            value={url}
            maxLength={2048}
            placeholder="https://example.com/photo.jpg"
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setUrl(event.target.value);
              setPreviewError("");
              event.target.setCustomValidity("");
            }}
          />
        </div>
      )}
      <small id={`${id}-hint`}>
        {source === "device"
          ? "JPG, PNG or WebP, up to 5 MB. Your current photo stays until you choose a replacement."
          : "Paste a direct image link to preview and use it throughout the app."}
      </small>
      {preview && !previewError && (
        <div className="image-picker-preview">
          <img
            src={preview}
            alt="Selected image preview"
            referrerPolicy="no-referrer"
            onError={() => {
              setPreviewError(
                "This image could not be loaded. Choose another file or use a direct image link.",
              );
              urlInput.current?.setCustomValidity(
                "Enter a working direct image link.",
              );
            }}
            onLoad={() => urlInput.current?.setCustomValidity("")}
          />
        </div>
      )}
      {(previewError || error) && (
        <small className="field-error" role="status">
          {previewError || error}
        </small>
      )}
    </fieldset>
  );
}
