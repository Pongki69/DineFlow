// Credentials stay in the browser's password manager, never application storage.
export function supportsSavedLogins() {
  return Boolean(
    globalThis.isSecureContext &&
    typeof globalThis.PasswordCredential === "function" &&
    typeof navigator.credentials?.get === "function" &&
    typeof navigator.credentials?.store === "function",
  );
}

export async function offerToSaveLogin({ email, password, name }) {
  if (!supportsSavedLogins()) return false;
  try {
    const credential = new globalThis.PasswordCredential({
      id: email,
      password,
      name,
    });
    await navigator.credentials.store(credential);
    return true;
  } catch {
    // Browser preferences, private mode or dismissal must never block sign-in.
    return false;
  }
}

export async function getSavedLogin() {
  if (!supportsSavedLogins()) return null;
  try {
    // Always let the user choose; never silently log in after an explicit logout.
    const credential = await navigator.credentials.get({
      password: true,
      mediation: "required",
    });
    return credential?.type === "password" ? credential : null;
  } catch {
    return null;
  }
}
