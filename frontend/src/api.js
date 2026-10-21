export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const pendingSubmissions = new Map();

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
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
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
  if (submission) pendingSubmissions.delete(submission);
  return response.status === 204 ? null : response.json();
}

export async function csrf() {
  await fetch(`${API_BASE.replace(/\/api\/v1$/, "")}/sanctum/csrf-cookie`, {
    credentials: "include",
  });
}
