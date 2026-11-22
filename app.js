// CloudSync Lab — browser-safe Supabase configuration.
const SUPABASE_URL = "https://rrlfnghoxocplelqigdc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_j1cAUpJiW1hqJcKDD9Kk7Q_0jOaV7o6";
const client = window.supabase && typeof window.supabase.createClient === "function"
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { experimental: { passkey: true } }
    })
  : null;
const $ = (id) => document.getElementById(id);
let mode = "signin", currentUser = null, editingId = null, channel = null, toastTimer;

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
function setMode(next) {
  mode = next;
  $("authTitle").textContent = mode === "signin" ? "Welcome back" : "Create your account";
  $("authSubtitle").textContent = mode === "signin" ? "Sign in to access your private notes." : "Register with your email and a unique password.";
  $("authSubmit").innerHTML = mode === "signin" ? 'Sign in <span>→</span>' : 'Create account <span>→</span>';
  $("switchText").textContent = mode === "signin" ? "New to CloudSync Lab?" : "Already registered?";
  $("switchMode").textContent = mode === "signin" ? "Create an account" : "Sign in instead";
  $("password").autocomplete = mode === "signin" ? "current-password" : "new-password";
  if (passkeySignInButton) passkeySignInButton.classList.toggle("hidden", mode === "signup");
}
$("switchMode").addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

const passkeySignInButton = $("passkeySignIn");
if (passkeySignInButton) {
  passkeySignInButton.addEventListener("click", async () => {
    if (!client) return toast("Supabase is unavailable. Refresh the page and try again.");
    if (!window.isSecureContext || !navigator.credentials) {
      return toast("Passkeys require a supported browser on this HTTPS website.");
    }
    passkeySignInButton.disabled = true;
    passkeySignInButton.textContent = "Waiting for your passkey…";
    try {
      const { data, error } = await client.auth.signInWithPasskey();
      if (error) throw error;
      if (data?.user) toast("Signed in with your passkey.");
    } catch (e) {
      const message = e.name === "NotAllowedError"
        ? "No usable passkey was selected. Cancel the USB security-key prompt. First sign in with email or Google, then open Settings → Security and register a passkey. For Windows Hello, set up a Windows Hello PIN in Windows Settings → Accounts → Sign-in options."
        : (e.message || "Passkey sign-in failed.");
      toast(message);
    } finally {
      passkeySignInButton.disabled = false;
      passkeySignInButton.innerHTML = '<span class="passkey-symbol" aria-hidden="true">⌘</span><span>Sign in with a passkey</span>';
    }
  });
}

const googleSignInButton = $("googleSignIn");
const googleButtonMarkup = googleSignInButton ? googleSignInButton.innerHTML : "";
if (googleSignInButton) {
  googleSignInButton.addEventListener("click", async () => {
    if (!client) return toast("Supabase is unavailable. Refresh the page and try again.");
    googleSignInButton.disabled = true;
    googleSignInButton.textContent = "Connecting to Google…";
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });
      if (error) throw error;
    } catch (e) {
      toast(e.message || "Google sign-in could not be started.");
      googleSignInButton.disabled = false;
      googleSignInButton.innerHTML = googleButtonMarkup;
    }
  });
}


// Discord OAuth authentication
const discordSignInButton = $("discordSignIn");

if (discordSignInButton) {
  discordSignInButton.addEventListener("click", async () => {
    if (!client) {
      return toast("Supabase connection unavailable.");
    }

    discordSignInButton.disabled = true;
    discordSignInButton.innerHTML = "Connecting to Discord...";

    try {
      const redirectTo =
        window.location.origin + window.location.pathname;

      const { error } = await client.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo,
          scopes: "identify email"
        }
      });

      if (error) throw error;

    } catch (error) {
      console.error("Discord OAuth error:", error);

      toast(error.message || "Discord login failed.");

      discordSignInButton.disabled = false;
      discordSignInButton.innerHTML = `
        Continue with Discord
      `;
    }
  });
}



let pendingMfaFactors = [];
let pendingTotpFactorId = null;
let authRenderVersion = 0;

$("mfaChallengeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client) return;
  const factorId = $("mfaFactorSelect").value;
  const code = $("mfaChallengeCode").value.trim();
  if (!factorId || !/^\d{6}$/.test(code)) return toast("Enter the current six-digit authenticator code.");
  const button = $("mfaVerifyButton");
  button.disabled = true; button.textContent = "Verifying…";
  try {
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error) throw challenge.error;
    const verify = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code
    });
    if (verify.error) throw verify.error;
    $("mfaChallengeCode").value = "";
    toast("Two-factor verification successful.");
    await renderAuthenticated(currentUser);
  } catch (e) {
    toast(e.message || "The verification code was not accepted. Try the newest code.");
  } finally {
    button.disabled = false; button.innerHTML = 'Verify and continue <span>→</span>';
  }
});
$("mfaSignOut").addEventListener("click", async () => {
  if (client) await client.auth.signOut();
});

async function renderAuthenticated(user) {
  if (!user || !client) return;
  currentUser = user;
  const version = ++authRenderVersion;
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (version !== authRenderVersion) return;

    if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
      const listed = await client.auth.mfa.listFactors();
      if (listed.error) throw listed.error;
      const verifiedTotp = (listed.data?.totp || []).filter(f => f.status === "verified");
      pendingMfaFactors = verifiedTotp;
      if (!verifiedTotp.length) {
        throw new Error("Your account requires an additional factor, but no verified authenticator was returned. Contact the site administrator.");
      }
      $("mfaFactorSelect").innerHTML = verifiedTotp.map(f =>
        '<option value="' + esc(f.id) + '">' + esc(f.friendly_name || "Authenticator app") + '</option>'
      ).join("");
      $("authView").classList.add("hidden");
      $("appView").classList.add("hidden");
      $("mfaView").classList.remove("hidden");
      $("settingsPanel").classList.add("hidden");
      $("mfaChallengeCode").focus();
      return;
    }
    if (version !== authRenderVersion) return;
    showApp(user);
  } catch (e) {
    if (version !== authRenderVersion) return;
    $("authView").classList.add("hidden");
    $("appView").classList.add("hidden");
    $("mfaView").classList.remove("hidden");
    $("mfaChallengeForm").classList.add("hidden");
    $("mfaView").querySelector(".auth-panel h2").textContent = "Security check unavailable";
    $("mfaView").querySelector(".auth-panel > p").textContent = e.message || "We could not verify your account's security level. Refresh and try again.";
  }
}

function showApp(user) {
  currentUser = user;
  $("authView").classList.add("hidden");
  $("mfaView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("accountEmail").textContent = user.email || "Signed-in user";
  $("avatar").textContent = (user.email || "U")[0].toUpperCase();
  loadNotes();
  loadPasskeys();
  loadTotpFactors();
  loadConnectedIdentities();
  if (channel) client.removeChannel(channel);
  channel = client.channel("notes-" + user.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "cloud_notes", filter: "user_id=eq." + user.id }, loadNotes)
    .subscribe();
}
function openSettings() {
  $("settingsPanel").classList.remove("hidden");
  loadPasskeys();
  loadTotpFactors();
  loadConnectedIdentities();
  $("settingsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ======================================
// CONNECTED ACCOUNT MANAGEMENT
// ======================================

const connectGoogleIdentityButton = $("connectGoogleIdentity");
const connectDiscordIdentityButton = $("connectDiscordIdentity");
const refreshConnectedIdentitiesButton = $("refreshConnectedIdentities");
const connectedIdentityStatus = $("connectedIdentityStatus");
const noMoreProvidersMessage = $("noMoreProviders");

const identityProviderInfo = {
  google: {
    label: "Google",
    logo: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.26 5.47-4.76 7.16l7.73 6C44.39 37.8 46.98 31.7 46.98 24.55z"/>
      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.88-5.82l-7.73-6c-2.14 1.44-4.89 2.3-8.15 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`
  },
  discord: {
    label: "Discord",
    logo: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M19.73 5.34A19.4 19.4 0 0 0 14.9 3.85l-.59 1.2a18 18 0 0 0-4.62 0l-.6-1.2a19.3 19.3 0 0 0-4.83 1.49C1.2 9.86.37 14.29.78 18.65a19.5 19.5 0 0 0 5.92 2.99l1.28-2.09a12.6 12.6 0 0 1-2.02-.97l.5-.39a13.9 13.9 0 0 0 13.08 0l.5.39c-.65.39-1.33.72-2.03.97l1.28 2.09a19.5 19.5 0 0 0 5.92-2.99c.49-5.06-.84-9.45-3.48-13.31ZM8.73 15.51c-1.14 0-2.08-1.05-2.08-2.34s.92-2.34 2.08-2.34 2.1 1.06 2.08 2.34c0 1.29-.92 2.34-2.08 2.34Zm6.54 0c-1.14 0-2.08-1.05-2.08-2.34s.92-2.34 2.08-2.34 2.1 1.06 2.08 2.34c0 1.29-.91 2.34-2.08 2.34Z"/>
    </svg>`
  }
};

function withIdentityTimeout(promise, milliseconds = 7000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error("The identity service took too long to respond.")),
        milliseconds
      );
    })
  ]);
}

function normalizeIdentities(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.identities)) return value.identities;
  return null;
}

async function fetchCurrentIdentities() {
  if (!client || !currentUser) {
    throw new Error("Sign in again to view connected accounts.");
  }

  let lastError = null;

  // Preferred endpoint: returns the identities attached to the current user.
  if (typeof client.auth.getUserIdentities === "function") {
    try {
      const result = await withIdentityTimeout(
        client.auth.getUserIdentities()
      );
      if (result.error) throw result.error;

      const identities = normalizeIdentities(result.data);
      if (identities) return identities;
    } catch (error) {
      lastError = error;
      console.warn("getUserIdentities failed; trying the current-user response.", error);
    }
  }

  // Fallback: fetch the authenticated user from Supabase Auth.
  try {
    const result = await withIdentityTimeout(client.auth.getUser(), 6000);
    if (result.error) throw result.error;

    const user = result.data?.user;
    if (!user || user.id !== currentUser.id) {
      throw new Error("The signed-in account changed. Please sign in again.");
    }

    const identities = normalizeIdentities(user.identities);
    if (identities) return identities;
  } catch (error) {
    lastError = error;
  }

  // Last-resort fallback: use identities included in the active auth session.
  const sessionIdentities = normalizeIdentities(currentUser.identities);
  if (sessionIdentities) return sessionIdentities;

  throw lastError || new Error("Supabase did not return the connected identity list.");
}

function renderConnectedIdentities(identities) {
  const list = $("connectedIdentityList");
  if (!list) return;

  const providers = identities.filter(identity =>
    Object.prototype.hasOwnProperty.call(identityProviderInfo, identity.provider)
  );

  const uniqueProviders = [];
  const seen = new Set();
  for (const identity of providers) {
    if (!seen.has(identity.provider)) {
      seen.add(identity.provider);
      uniqueProviders.push(identity);
    }
  }

  if (!uniqueProviders.length) {
    list.innerHTML = '<div class="muted-small">No Google or Discord accounts are connected yet.</div>';
  } else {
    list.innerHTML = uniqueProviders.map(identity => {
      const info = identityProviderInfo[identity.provider];
      const details = identity.identity_data || {};
      const accountLabel =
        details.email ||
        details.full_name ||
        details.name ||
        details.username ||
        "Provider account linked";

      return `
        <div class="connected-identity-item">
          <span class="connected-identity-icon ${esc(identity.provider)}">
            ${info.logo}
          </span>
          <div class="connected-identity-details">
            <strong>${info.label}</strong>
            <small>${esc(accountLabel)}</small>
          </div>
          <span class="identity-connected">Connected</span>
        </div>
      `;
    }).join("");
  }

  const linked = new Set(uniqueProviders.map(identity => identity.provider));
  const googleLinked = linked.has("google");
  const discordLinked = linked.has("discord");

  if (connectGoogleIdentityButton) {
    connectGoogleIdentityButton.classList.toggle("hidden", googleLinked);
    connectGoogleIdentityButton.disabled = false;
    connectGoogleIdentityButton.innerHTML =
      identityProviderInfo.google.logo +
      '<span>Connect Google</span><span class="identity-button-arrow" aria-hidden="true">→</span>';
  }

  if (connectDiscordIdentityButton) {
    connectDiscordIdentityButton.classList.toggle("hidden", discordLinked);
    connectDiscordIdentityButton.disabled = false;
    connectDiscordIdentityButton.innerHTML =
      identityProviderInfo.discord.logo +
      '<span>Connect Discord</span><span class="identity-button-arrow" aria-hidden="true">→</span>';
  }

  const noMoreAvailable = googleLinked && discordLinked;
  if (noMoreProvidersMessage) {
    noMoreProvidersMessage.classList.toggle("hidden", !noMoreAvailable);
  }
}

async function loadConnectedIdentities() {
  const list = $("connectedIdentityList");
  if (!client || !currentUser || !list) return;

  const cachedIdentities = normalizeIdentities(currentUser.identities);

  // Render session identities immediately when available, so the UI never
  // remains stuck on a loading placeholder while the server refreshes.
  if (cachedIdentities) {
    renderConnectedIdentities(cachedIdentities);
    if (connectedIdentityStatus) {
      connectedIdentityStatus.className = "identity-status";
      connectedIdentityStatus.textContent = "Refreshing provider information…";
    }
  } else {
    if (connectedIdentityStatus) {
      connectedIdentityStatus.className = "identity-status";
      connectedIdentityStatus.textContent = "Checking your connected accounts…";
    }
    list.innerHTML = "";
    if (connectGoogleIdentityButton) connectGoogleIdentityButton.disabled = true;
    if (connectDiscordIdentityButton) connectDiscordIdentityButton.disabled = true;
  }

  if (refreshConnectedIdentitiesButton) {
    refreshConnectedIdentitiesButton.disabled = true;
    refreshConnectedIdentitiesButton.textContent = "Refreshing…";
  }

  try {
    const identities = await fetchCurrentIdentities();
    renderConnectedIdentities(identities);

    if (connectedIdentityStatus) {
      connectedIdentityStatus.className = "identity-status";
      connectedIdentityStatus.textContent = "Your connected providers are up to date.";
    }
  } catch (error) {
    console.error("Connected account refresh failed:", error);

    if (cachedIdentities) {
      renderConnectedIdentities(cachedIdentities);
      if (connectedIdentityStatus) {
        connectedIdentityStatus.className = "identity-status";
        connectedIdentityStatus.textContent =
          "Showing the identities in your active session. Use Refresh to try the server again.";
      }
    } else {
      if (connectedIdentityStatus) {
        connectedIdentityStatus.className = "identity-status error";
        connectedIdentityStatus.textContent =
          "Could not load connected accounts: " + (error.message || "Unknown error");
      }
      list.innerHTML = "";
      if (connectGoogleIdentityButton) connectGoogleIdentityButton.disabled = true;
      if (connectDiscordIdentityButton) connectDiscordIdentityButton.disabled = true;
    }
  } finally {
    if (refreshConnectedIdentitiesButton) {
      refreshConnectedIdentitiesButton.disabled = false;
      refreshConnectedIdentitiesButton.textContent = "↻ Refresh";
    }
  }
}

async function connectIdentity(provider, button) {
  if (!client || !currentUser) {
    return toast("Please sign in before linking another account.");
  }
  if (!identityProviderInfo[provider] || button.disabled) return;

  button.disabled = true;
  const originalMarkup = button.innerHTML;
  button.innerHTML = '<span>Connecting securely…</span>';

  try {
    const { data: userData, error: userError } =
      await withIdentityTimeout(client.auth.getUser(), 7000);
    if (userError) throw userError;

    if (!userData.user || userData.user.id !== currentUser.id) {
      throw new Error("Your active account changed. Please sign in again.");
    }

    const identities = await fetchCurrentIdentities();
    if (identities.some(identity => identity.provider === provider)) {
      await loadConnectedIdentities();
      toast("This provider is already connected to this account.");
      return;
    }

    const redirectTo = window.location.origin + window.location.pathname;
    const scopes = provider === "discord"
      ? "identify email"
      : "openid email profile";

    const { error } = await client.auth.linkIdentity({
      provider,
      options: { redirectTo, scopes }
    });

    if (error) throw error;
    // Supabase redirects the browser to the provider. After authorization,
    // the user returns here and the identity list is refreshed.
  } catch (error) {
    console.error("Identity linking failed:", error);
    const message = error.message || "Could not connect this provider.";

    if (/identity_already_exists|already linked|identity.*exists/i.test(message)) {
      alert(
        "This provider is already linked to another CloudSync account.\n\n" +
        "Your accounts and notes have NOT been merged or changed.\n\n" +
        "Sign in to the other account separately before attempting an approved account merge."
      );
    } else {
      toast(message);
    }

    await loadConnectedIdentities();
  } finally {
    if (button && !button.classList.contains("hidden")) {
      button.disabled = false;
      if (!button.innerHTML || button.innerHTML.includes("Connecting securely")) {
        button.innerHTML = originalMarkup;
      }
    }
  }
}

connectGoogleIdentityButton?.addEventListener(
  "click",
  () => connectIdentity("google", connectGoogleIdentityButton)
);

connectDiscordIdentityButton?.addEventListener(
  "click",
  () => connectIdentity("discord", connectDiscordIdentityButton)
);

refreshConnectedIdentitiesButton?.addEventListener(
  "click",
  loadConnectedIdentities
);

$("openSettings").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", () => $("settingsPanel").classList.add("hidden"));

if (!client) {
  if (googleSignInButton) googleSignInButton.disabled = true;
  $("connectionNotice").classList.remove("hidden");
  $("connectionNotice").textContent = "The Supabase browser library did not load. Check your internet connection or try another network. The account form is available, but cloud login cannot work until the library loads.";
  $("authSubtitle").textContent = "Cloud connection is not ready.";
}
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client) return toast("Supabase library unavailable. Refresh the page or try another network.");
  const btn = $("authSubmit"), email = $("email").value.trim(), password = $("password").value;
  btn.disabled = true; btn.textContent = mode === "signin" ? "Signing in…" : "Creating account…";
  try {
    if (mode === "signup") {
      const redirect = location.protocol === "https:" ? location.href.split("#")[0] : undefined;
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
      if (error) throw error;
      toast(data.session ? "Account created and signed in." : "Account created. Check your email to confirm, then sign in.");
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast("Signed in successfully.");
    }
  } catch (e) { toast(e.message || "Authentication failed."); }
  finally { btn.disabled = false; btn.innerHTML = mode === "signin" ? 'Sign in <span>→</span>' : 'Create account <span>→</span>'; }
});
$("signOut").addEventListener("click", async () => {
  if (!client) return;
  const { error } = await client.auth.signOut(); if (error) toast(error.message);
});
$("refreshNotes").addEventListener("click", loadNotes);

$("addPasskey").addEventListener("click", async () => {
  if (!client || !currentUser) return toast("Sign in before registering a passkey.");
  if (!window.isSecureContext || !navigator.credentials) {
    return toast("Passkeys require a compatible browser on this HTTPS website.");
  }
  if (/Windows/i.test(navigator.userAgent) &&
      window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
    try {
      const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        return toast("Windows Hello is not available yet. Open Windows Settings → Accounts → Sign-in options → PIN (Windows Hello), set up a PIN, then register again. You can also register a passkey on your phone.");
      }
    } catch (_) {}
  }
  const button = $("addPasskey");
  button.disabled = true;
  button.textContent = "Waiting for your device…";
  try {
    const { data, error } = await client.auth.registerPasskey();
    if (error) throw error;
    toast("Passkey registered successfully.");
    await loadPasskeys();
  } catch (e) {
    const message = e.name === "NotAllowedError"
      ? "Passkey setup was cancelled or timed out. You can try again."
      : (e.message || "Could not register this passkey.");
    toast(message);
  } finally {
    button.disabled = false;
    button.textContent = "＋ Register a passkey";
  }
});

$("startTotp").addEventListener("click", async () => {
  if (!client || !currentUser) return toast("Sign in before setting up two-factor authentication.");
  const button = $("startTotp");
  button.disabled = true; button.textContent = "Preparing QR code…";
  try {
    const { data, error } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "CloudSync Lab authenticator"
    });
    if (error) throw error;
    pendingTotpFactorId = data.id;
    $("totpQr").src = data.totp.qr_code;
    $("totpSecret").textContent = data.totp.secret;
    $("totpEnrollment").classList.remove("hidden");
    $("totpVerifyCode").value = "";
    toast("Scan the QR code with your authenticator app, then verify a code.");
  } catch (e) {
    toast(e.message || "Could not start authenticator setup.");
  } finally {
    button.disabled = false; button.textContent = "＋ Set up authenticator app";
  }
});

$("totpVerifyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !pendingTotpFactorId) return;
  const code = $("totpVerifyCode").value.trim();
  if (!/^\d{6}$/.test(code)) return toast("Enter the current six-digit code from your authenticator app.");
  const button = $("verifyTotpButton");
  button.disabled = true; button.textContent = "Verifying…";
  try {
    const challenge = await client.auth.mfa.challenge({ factorId: pendingTotpFactorId });
    if (challenge.error) throw challenge.error;
    const verify = await client.auth.mfa.verify({
      factorId: pendingTotpFactorId,
      challengeId: challenge.data.id,
      code
    });
    if (verify.error) throw verify.error;
    pendingTotpFactorId = null;
    $("totpEnrollment").classList.add("hidden");
    $("totpSecret").textContent = "";
    $("totpQr").removeAttribute("src");
    $("totpVerifyCode").value = "";
    toast("Two-factor authentication is now enabled. Other active sessions may need to sign in again.");
    await loadTotpFactors();
    await renderAuthenticated(currentUser);
  } catch (e) {
    toast(e.message || "That code was not accepted. Try the newest code.");
  } finally {
    button.disabled = false; button.innerHTML = 'Verify and enable 2FA <span>→</span>';
  }
});
$("cancelTotp").addEventListener("click", async () => {
  $("totpEnrollment").classList.add("hidden");
  if (pendingTotpFactorId) {
    try { await client.auth.mfa.unenroll({ factorId: pendingTotpFactorId }); } catch (_) {}
  }
  pendingTotpFactorId = null;
  $("totpSecret").textContent = ""; $("totpQr").removeAttribute("src");
});

async function loadTotpFactors() {
  if (!client || !currentUser) return;
  const status = $("totpStatus"), list = $("totpFactorList");
  status.textContent = "Checking your two-factor settings…";
  try {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    const verified = (data?.totp || []).filter(f => f.status === "verified");
    const pending = (data?.totp || []).filter(f => f.status !== "verified");
    if (verified.length) {
      status.className = "security-status enabled";
      status.textContent = "Two-factor authentication is enabled. Sign-ins require an authenticator code.";
      $("startTotp").textContent = "＋ Add another authenticator";
    } else {
      status.className = "security-status";
      status.textContent = "Two-factor authentication is not enabled for this account.";
      $("startTotp").textContent = "＋ Set up authenticator app";
    }
    list.innerHTML = verified.map(f =>
      '<div class="totp-factor-item"><span>✓ ' + esc(f.friendly_name || "Authenticator app") + '</span><button class="factor-remove" type="button" data-remove-factor="' + esc(f.id) + '">Remove</button></div>'
    ).join("");
    for (const factor of pending) {
      list.innerHTML += '<div class="totp-factor-item"><span>Pending setup: ' + esc(factor.friendly_name || "Authenticator app") + '</span><button class="factor-remove" type="button" data-remove-factor="' + esc(factor.id) + '">Remove</button></div>';
    }
    list.querySelectorAll("[data-remove-factor]").forEach(button => {
      button.addEventListener("click", async () => {
        const id = button.dataset.removeFactor;
        if (!confirm("Remove this authenticator factor? If it is your only verified factor, future sign-ins will no longer require its code.")) return;
        button.disabled = true;
        try {
          const { error } = await client.auth.mfa.unenroll({ factorId: id });
          if (error) throw error;
          await client.auth.refreshSession();
          toast("Authenticator factor removed.");
          await loadTotpFactors();
          await renderAuthenticated(currentUser);
        } catch (e) {
          toast(e.message || "Could not remove this factor.");
          button.disabled = false;
        }
      });
    });
  } catch (e) {
    status.className = "security-status pending";
    status.textContent = "Could not load authenticator settings: " + (e.message || "Unknown error");
  }
}
$("cancelEdit").addEventListener("click", resetEditor);
$("noteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !currentUser) return toast("Please sign in first.");
  const btn = $("saveNote"), payload = { user_id: currentUser.id, title: $("noteTitle").value.trim(), body: $("noteBody").value.trim(), updated_at: new Date().toISOString() };
  if (!payload.title || !payload.body) return toast("Enter both a title and message.");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const result = editingId
      ? await client.from("cloud_notes").update(payload).eq("id", editingId)
      : await client.from("cloud_notes").insert(payload);
    if (result.error) throw result.error;
    resetEditor(); await loadNotes(); toast("Saved to Supabase.");
  } catch (e) { toast(e.message || "Could not save note."); }
  finally { btn.disabled = false; btn.innerHTML = "Save to cloud <span>↑</span>"; }
});
function resetEditor() {
  editingId = null; $("noteForm").reset(); $("editorTitle").textContent = "Create a note";
  $("cancelEdit").classList.add("hidden"); $("saveNote").innerHTML = "Save to cloud <span>↑</span>";
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function dateLabel(s) { return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(s)); }

async function loadPasskeys() {
  const list = $("passkeyList");
  if (!list || !client || !currentUser) return;
  list.innerHTML = '<span class="muted-small">Loading passkeys…</span>';
  try {
    const { data, error } = await client.auth.passkey.list();
    if (error) throw error;
    const passkeys = Array.isArray(data) ? data : (data?.passkeys || []);
    if (!passkeys.length) {
      list.innerHTML = '<span class="muted-small">No passkeys registered yet. Register one on this device to enable passwordless sign-in.</span>';
      return;
    }
    list.innerHTML = passkeys.map((item) => {
      const name = item.friendly_name || "Passkey";
      const created = item.created_at ? "Added " + dateLabel(item.created_at) : "Registered passkey";
      const lastUsed = item.last_used_at ? " · Last used " + dateLabel(item.last_used_at) : "";
      return '<div class="passkey-item">' +
        '<span class="passkey-item-icon" aria-hidden="true">⌘</span>' +
        '<span class="passkey-item-info"><b>' + esc(name) + '</b><small>' + esc(created + lastUsed) + '</small></span>' +
        '<button class="passkey-remove" type="button" data-remove-passkey="' + esc(item.id) + '">Remove</button>' +
      '</div>';
    }).join("");
    list.querySelectorAll("[data-remove-passkey]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.removePasskey;
        if (!id || !confirm("Remove this passkey from your account? This device may no longer be able to sign in with it.")) return;
        button.disabled = true;
        try {
          const { error } = await client.auth.passkey.delete({ passkeyId: id });
          if (error) throw error;
          toast("Passkey removed from your account.");
          await loadPasskeys();
        } catch (e) {
          toast(e.message || "Could not remove this passkey.");
          button.disabled = false;
        }
      });
    });
  } catch (e) {
    list.innerHTML = '<span class="muted-small">Could not load passkeys: ' + esc(e.message || "Unknown error") + '</span>';
  }
}
async function loadNotes() {
  if (!client || !currentUser) return;
  $("syncLabel").textContent = "Syncing…";
  const { data, error } = await client.from("cloud_notes").select("id,title,body,created_at,updated_at").order("updated_at",{ascending:false});
  if (error) { $("syncLabel").textContent = "Sync issue"; toast(error.message); return; }
  $("syncLabel").textContent = "Cloud connected"; $("noteCount").textContent = data.length;
  const list = $("notesList");
  if (!data.length) { list.innerHTML = '<div class="empty"><b>No notes yet</b><p>Create your first note. It will appear here and on your other devices.</p></div>'; return; }
  list.innerHTML = data.map(n => '<article class="note-card"><h3>'+esc(n.title)+'</h3><p>'+esc(n.body)+'</p><div class="note-meta"><span>Updated '+esc(dateLabel(n.updated_at))+'</span><span class="note-actions"><button data-edit="'+n.id+'">Edit</button><button class="delete" data-delete="'+n.id+'">Delete</button></span></div></article>').join("");
  list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const n = data.find(x => x.id === b.dataset.edit); editingId = n.id;
    $("noteTitle").value = n.title; $("noteBody").value = n.body; $("editorTitle").textContent = "Edit note";
    $("saveNote").innerHTML = "Update note <span>↑</span>"; $("cancelEdit").classList.remove("hidden");
    window.scrollTo({top:0,behavior:"smooth"});
  }));
  list.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Delete this note permanently?")) return;
    const { error } = await client.from("cloud_notes").delete().eq("id",b.dataset.delete);
    if (error) toast(error.message); else { await loadNotes(); toast("Note deleted."); }
  }));
}
function signedOut() {
  authRenderVersion++;
  currentUser = null;
  pendingMfaFactors = [];
  if (channel && client) client.removeChannel(channel);
  channel = null;
  $("appView").classList.add("hidden");
  $("mfaView").classList.add("hidden");
  $("settingsPanel").classList.add("hidden");
  $("authView").classList.remove("hidden");
  $("mfaChallengeForm").classList.remove("hidden");
  $("mfaView").querySelector(".auth-panel h2").textContent = "Verify it's you";
  $("mfaView").querySelector(".auth-panel > p").textContent = "Open your authenticator app and enter the current code.";
}
if (client) {
  client.auth.onAuthStateChange((_event, session) => {
    // Run Supabase API calls after the auth callback has returned.
    setTimeout(() => {
      if (session?.user) renderAuthenticated(session.user);
      else signedOut();
    }, 0);
  });
  client.auth.getSession().then(({data,error}) => {
    if (error) toast(error.message);
    if (data.session?.user) renderAuthenticated(data.session.user);
    else signedOut();
  });
} else {
  signedOut();
}
