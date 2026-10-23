# Saved passwords and remembered sign-in

On the sign-in screen, use your browser's password manager to save and autofill
credentials. DineFlow offers to save credentials only after a successful sign-in
or registration. Browsers that support the Credential Management API also show
**Use a saved login**, which fills the form for review before signing in.
Other browsers retain their normal password autofill behavior.

Password saving is controlled by the browser and its settings. The optional
saved-login chooser requires HTTPS (or localhost). Browser account settings
control whether saved passwords stay on one device or sync across devices.
DineFlow does not store passwords in local storage or implement a password vault.

Select **Remember me** on a personal device to remain signed in on that browser
for up to 30 days, including after the normal session expires. This option is
unchecked by default. Laravel manages the encrypted, HttpOnly remember cookie;
production HTTPS configuration provides the Secure cookie flag.

Signing out removes remembered access from the browser and rotates the account's
remember token. Changing the password invalidates existing remembered cookies.
Signing in with Remember me unchecked clears any previous remembered-login cookie
on that browser. Signing out does not delete passwords saved by the browser;
manage those in the browser's password manager.

No additional API provider, dependency, or database migration is required.
