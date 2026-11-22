# CloudSync Lab

A small, independent learning project demonstrating Supabase Auth, PostgreSQL, Row Level Security (RLS), and cross-device note synchronization. It is not connected to Piano Logger.

## Files

- `index.html` — responsive login and notes interface
- `styles.css` — UI styling
- `app.js` — Supabase authentication, notes CRUD, and Realtime listener

## Supabase backend

- Project URL: `https://rrlfnghoxocplelqigdc.supabase.co`
- Browser key: publishable key (designed for public clients)
- Table: `public.cloud_notes`
- RLS: enabled; users can only read/insert/update/delete rows where `user_id = auth.uid()`.
- Realtime: `cloud_notes` is enabled for Supabase Realtime.

**Never put a Supabase secret key or service-role key in this repository.** The publishable key is not a secret; the database remains protected by RLS.

## Publish with GitHub Pages

1. Open this repository's **Settings** tab.
2. In the left sidebar, choose **Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose branch **main**, folder **/(root)**, then click **Save**.
5. Wait for GitHub Pages to publish the site. The URL should be:
   `https://kosandra0.github.io/cloudsync-lab/`

## Configure Supabase email redirects

After GitHub Pages is published:

1. Open the Supabase project dashboard.
2. Go to **Authentication → URL Configuration**.
3. Set **Site URL** to `https://kosandra0.github.io/cloudsync-lab/`.
4. Add the same URL to **Redirect URLs**, then save.
5. Under **Authentication → Providers → Email**, ensure email/password sign-in is enabled.

Email confirmation can be enabled. When enabled, a new user must open the confirmation email before signing in. Supabase's default email sender is rate-limited and is intended for testing; use a configured SMTP provider for a real public launch.

## Test on PC and phone

1. Open `https://kosandra0.github.io/cloudsync-lab/` on your PC.
2. Choose **Create an account**, enter an email address you control and a unique test password.
3. Confirm your email if requested, then sign in.
4. Save a test note.
5. Open the same HTTPS URL on your phone and sign in with the same account.
6. The note should appear. Add another note on the phone; it should update on the PC.
7. Create a second test account and verify it cannot see the first account's notes.

Do not use your important passwords or store sensitive personal information in this demo.

## Troubleshooting

- Do not use the local `file://` URL for the real authentication test. Use the HTTPS GitHub Pages URL so email confirmation redirects work correctly.
- If signup reports a redirect URL error, recheck **Authentication → URL Configuration**.
- If the browser reports that the Supabase library failed to load, check the network/CDN connection or try another network.
- If confirmation email does not arrive, check spam and the Supabase Auth email settings/rate limits.

## Security scope

This is a learning demo, not a production-ready application. It intentionally stores only simple text notes. Before a public launch, add abuse protection, privacy disclosures, operational monitoring, and a reviewed account/data deletion process.


## Passkey sign-in

CloudSync Lab includes Supabase Passkey support (currently experimental in `supabase-js`).

- Passkey support is opted into when the Supabase client is created.
- A user must first be signed in with a confirmed email account before registering a passkey.
- After registration, the user can sign out and choose **Sign in with a passkey**.
- Users can view and remove their own passkeys from the signed-in workspace.
- The website must be opened on its HTTPS GitHub Pages origin.
- Keep the WebAuthn Relying Party ID stable. For this site it is `kosandra0.github.io`; the allowed origin is `https://kosandra0.github.io`.

Passkeys are device/authenticator credentials, not passwords stored in this app. The app never receives a user's fingerprint, face scan, or device PIN.

See the [Supabase Passkey documentation](https://supabase.com/docs/guides/auth/passkeys) for current API status and browser requirements.
