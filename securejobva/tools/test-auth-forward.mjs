/* Drives the home page's auth-fragment forwarder.

   An emailed auth link whose redirect_to is refused falls back to the
   project's Site URL — the home page — which reads no auth fragment. The
   token sat in the address bar, the password was never set, and it looked
   exactly like an email that never arrived. That is what a password reset did
   for anybody whose page was not on the allow-list, and it is what every reset
   email sent before the list was corrected still does, because fixing a
   dashboard setting cannot reach into an inbox.

   So the home page hands the fragment on instead of swallowing it. The two
   things worth asserting are that it forwards what it should and, just as
   much, that it leaves an ordinary #anchor alone — a forwarder that fires on
   any hash would send somebody reading the pricing section to a sign-in page.

   Run: node tools/test-auth-forward.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const at = html.indexOf("function forwardAuthFragment(loc) {");
if (at < 0) throw new Error("no forwardAuthFragment() in index.html — renamed? this reads it by name");
let depth = 0, end = at;
for (let i = html.indexOf("{", at); i < html.length; i++) {
  if (html[i] === "{") depth++;
  else if (html[i] === "}") { depth--; if (!depth) { end = i; break; } }
}
const forward = new Function(html.slice(at, end + 1) + "; return forwardAuthFragment;")();

let bad = 0;
const is = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

const TOKEN = "access_token=eyJhbGciOi.abc.def&expires_in=3600&refresh_token=r1t2";

/* ── the links that must be rescued ───────────────────────────────────────── */
{
  const h = "#" + TOKEN + "&type=recovery";
  is("a reset link is handed to the page with the password form", forward({ hash: h }), "/status" + h);
}
{
  const h = "#" + TOKEN + "&type=signup";
  is("a sign-up confirmation goes to the applicant's page", forward({ hash: h }), "/status" + h);
}
{
  const h = "#" + TOKEN + "&type=magiclink";
  is("a client invite goes to the seats page", forward({ hash: h }), "/seats" + h);
}
{
  const h = "#" + TOKEN + "&type=invite";
  is("an invite goes to the seats page", forward({ hash: h }), "/seats" + h);
}
{
  /* No type at all still carries a session worth keeping. */
  const h = "#" + TOKEN;
  is("a token with no type still gets somewhere that reads it", forward({ hash: h }), "/status" + h);
}

/* The token must survive the trip intact — forwarding a truncated fragment
   would be a session that cannot be restored, which is the original bug with
   extra steps. */
{
  const h = "#" + TOKEN + "&type=recovery";
  const to = forward({ hash: h });
  is("the fragment arrives byte for byte", to.slice(to.indexOf("#")), h);
}

/* ── errors, which used to be silence ─────────────────────────────────────── */
{
  const h = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
  is("an expired link is forwarded so it can say so", forward({ hash: h }), "/status" + h);
}
{
  const h = "#error=server_error&error_description=Something+went+wrong";
  is("an error with only a description is still forwarded", forward({ hash: h }), "/status" + h);
}

/* ── everything else must be left alone ───────────────────────────────────── */
is("no hash, no forward", forward({ hash: "" }), "");
is("a bare # is not a link", forward({ hash: "#" }), "");
is("an ordinary anchor is left alone", forward({ hash: "#pricing" }), "");
is("a section literally called error is left alone", forward({ hash: "#error" }), "");
/* The documented boundary: `error` alone is not enough to call it an auth
   link, because GoTrue never sends one without a code or a description and an
   anchor might be named anything. Pinned, because the obvious simplification
   here — testing `error` instead of the two fields — leaves every other case
   in this file green. */
is("an anchor of the form #error=something is left alone",
  forward({ hash: "#error=access_denied" }), "");
is("a deep link with params but no token is left alone",
  forward({ hash: "#tab=faq&open=2" }), "");

console.log("");
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("14 behaviours, four link types and the anchors it must not touch");
