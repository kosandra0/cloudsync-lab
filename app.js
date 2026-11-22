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
        ? "Passkey sign-in was cancelled or no matching passkey was selected."
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
function signedIn(user) {
  currentUser = user; $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("accountEmail").textContent = user.email || "Signed-in user"; $("avatar").textContent = (user.email || "U")[0].toUpperCase();
  loadNotes();
  loadPasskeys();
  if (channel) client.removeChannel(channel);
  channel = client.channel("notes-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"cloud_notes",filter:"user_id=eq."+user.id},loadNotes).subscribe();
}
function signedOut() {
  currentUser = null; if (channel && client) client.removeChannel(channel); channel = null;
  $("appView").classList.add("hidden"); $("authView").classList.remove("hidden");
}
if (client) {
  client.auth.onAuthStateChange((_event, session) => session?.user ? signedIn(session.user) : signedOut());
  client.auth.getSession().then(({data,error}) => {
    if (error) toast(error.message);
    if (data.session?.user) signedIn(data.session.user); else signedOut();
  });
} else {
  signedOut();
}
