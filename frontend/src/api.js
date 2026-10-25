export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const pendingSubmissions = new Map();
const DEFAULT_TIMEOUT_MS = 20000;

// Bound both the request and its response body, even on an unreliable connection.
async function boundedRequest(options, perform) {
  const {
    signal: callerSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    ...requestOptions
  } = options;
  const controller = new AbortController();
  let timer;
  let onAbort;
  const cancellation = new Promise((_, reject) => {
    onAbort = () => {
      const reason =
        callerSignal.reason ||
        new DOMException("Request cancelled", "AbortError");
      controller.abort(reason);
      reject(reason);
    };
    if (callerSignal?.aborted) onAbort();
    else callerSignal?.addEventListener("abort", onAbort, { once: true });
    if (!controller.signal.aborted) {
      timer = setTimeout(
        () => {
          const mutation = !["GET", "HEAD"].includes(
            (requestOptions.method || "GET").toUpperCase(),
          );
          const error = new Error(
            mutation
              ? "Request timed out. Your change may have reached the server. Refresh to check its status before trying again."
              : "Request timed out. Check your connection and try again.",
          );
          error.name = "TimeoutError";
          error.code = "request_timeout";
          error.uncertain = mutation;
          controller.abort(error);
          reject(error);
        },
        Number.isFinite(timeoutMs) && timeoutMs > 0
          ? timeoutMs
          : DEFAULT_TIMEOUT_MS,
      );
    }
  });
  try {
    if (controller.signal.aborted) return await cancellation;
    return await Promise.race([
      perform({ ...requestOptions, signal: controller.signal }),
      cancellation,
    ]);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onAbort);
  }
}

export async function api(path, options = {}) {
  const protectedSubmission =
    options.method?.toUpperCase() === "POST" &&
    /^\/(orders|reservations)(\/\d+\/reschedule)?$/.test(path);
  const submission = protectedSubmission
    ? `${path}:${options.body || ""}`
    : null;
  if (submission && !pendingSubmissions.has(submission)) {
    if (pendingSubmissions.size >= 200)
      pendingSubmissions.delete(pendingSubmissions.keys().next().value);
    pendingSubmissions.set(submission, crypto.randomUUID());
  }
  const xsrf = document.cookie
    .split("; ")
    .find((row) => row.startsWith("XSRF-TOKEN="))
    ?.split("=")
    .slice(1)
    .join("=");
  return boundedRequest(options, async (requestOptions) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...requestOptions,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
        ...(submission
          ? { "Idempotency-Key": pendingSubmissions.get(submission) }
          : {}),
        ...options.headers,
      },
    });
    if (!response.ok) {
      if (submission && response.status < 500)
        pendingSubmissions.delete(submission);
      const details = await response.json().catch(() => ({}));
      const error = new Error(details.message || "Request failed");
      error.status = response.status;
      error.code = details.code;
      error.errors = details.errors || {};
      throw error;
    }
    const result = response.status === 204 ? null : await response.json();
    requestOptions.signal.throwIfAborted();
    if (submission) pendingSubmissions.delete(submission);
    return result;
  });
}

export async function csrf() {
  await boundedRequest({}, (options) =>
    fetch(`${API_BASE.replace(/\/api\/v1$/, "")}/sanctum/csrf-cookie`, {
      ...options,
      credentials: "include",
    }),
  );
}
