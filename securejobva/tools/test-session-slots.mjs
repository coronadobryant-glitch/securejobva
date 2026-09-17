/* The handover from /status to the client portal.

   The five portal pages keep their sessions in separate slots — /status and
   /hub in "sjva-session", /seats and /pay in "sjva-session-client", /admin in
   "sjva-session-staff" — so that three audiences stop evicting each other.
   That is deliberate and this test does not argue with it.

   What it guards is the one place a page crosses the boundary on somebody's
   behalf. /status forwards a signed-in business with no application to
   /seats, and /seats reads the other slot, so before this the forward landed
   on a sign-in card: signed in, clicked nothing, asked to sign in again. The
   main nav's "Sign in" points at /status and 009 grants seats.view to every
   business, so it was the client front door.

   The fix plants the same token in the client drawer first. The line that
   matters is the one it will NOT overwrite — a live session belonging to
   somebody else is exactly the eviction the slots were added to stop.

   Run: node tools/test-session-slots.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("status.html", "utf8");

function lift(name) {
  const at = html.indexOf("function " + name + "(");
  if (at < 0) throw new Error("no " + name + "() in status.html — renamed? this reads it by name");
  let depth = 0, end = at;
  for (let i = html.indexOf("{", at); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  return html.slice(at, end + 1);
}

const CLIENT_KEY = "sjva-session-client";

/* A store the lifted code can drive, so the assertions are about what ends up
   in the drawer rather than about what the function says it did. */
function makeStore(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    store: map,
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); }
    }
  };
}

function build(seed, mine) {
  const { store, localStorage } = makeStore(seed);
  const fn = new Function(
    "localStorage", "loadSession", "Date",
    lift("readToken") + "\n" + lift("handToClientSlot") + "\n; return handToClientSlot;"
  )(localStorage, () => mine, Date);
  return { fn, store };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (email, exp) => "h." + b64({ email, exp }) + ".s";
const SOON = Math.floor(Date.now() / 1000) + 3600;
const GONE = Math.floor(Date.now() / 1000) - 3600;

const mine = { access_token: tok("her@example.com", SOON), refresh_token: "r" };
const theirsLive = JSON.stringify({ access_token: tok("him@example.com", SOON) });
const theirsDead = JSON.stringify({ access_token: tok("him@example.com", GONE) });

let bad = 0;
const is = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

console.log("\n  the handover to the client slot\n");

{
  const { fn, store } = build({}, mine);
  is("an empty drawer is filled, and the forward may go", fn(), true);
  is("  and what lands there is the same token", store.get(CLIENT_KEY), JSON.stringify(mine));
}

{
  const { fn, store } = build({ [CLIENT_KEY]: JSON.stringify({ access_token: tok("her@example.com", SOON) }) }, mine);
  is("her own live session is left to stand, and the forward may go", fn(), true);
  is("  and it is refreshed to the token in hand", store.get(CLIENT_KEY), JSON.stringify(mine));
}

{
  const { fn, store } = build({ [CLIENT_KEY]: theirsLive }, mine);
  is("somebody else, still signed in: the forward is refused", fn(), false);
  is("  and their session is left exactly as it was", store.get(CLIENT_KEY), theirsLive);
}

{
  const { fn, store } = build({ [CLIENT_KEY]: theirsDead }, mine);
  is("somebody else, expired: already spent, so it may be taken", fn(), true);
  is("  and the drawer now holds the live token", store.get(CLIENT_KEY), JSON.stringify(mine));
}

{
  const { fn } = build({}, null);
  is("no session to hand over: refused rather than forwarded", fn(), false);
}

{
  const { fn } = build({}, { access_token: "not.a.jwt" });
  is("a token with no email: refused", fn(), false);
}

console.log("\n  " + (bad ? bad + " failed" : "the boundary holds") + "\n");
process.exit(bad ? 1 : 0);
