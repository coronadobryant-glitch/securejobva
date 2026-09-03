/* Drives authError() and noteAuthError() out of the built portal pages.

   An emailed link that fails comes back with the reason in the fragment.
   authError() read it, start() handed it to signedOut(), and that was the end
   of it — so the message reached somebody who was signed out and nobody else.
   A person who followed an expired reset link while still holding a session
   got silence, which is the same failure the home page used to hand everybody,
   one step further in. On /status a business account was then redirected to
   /seats, which dropped it a second time.

   Both halves are asserted here: that the message survives into a signed-in
   page, and that it is drawn outside the view root — every page replaces that
   wholesale when it renders, so a banner written into it would be gone before
   anybody read it.

   Run: node tools/test-auth-error.mjs */
import { readFileSync, existsSync } from "node:fs";

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

function grab(js, name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "()");
  let d = 0;
  for (let i = js.indexOf("{", at); i < js.length; i++) {
    if (js[i] === "{") d++;
    else if (js[i] === "}") { d--; if (!d) return js.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

/* A view root inside a host, which is the shape every portal page has: the
   page replaces root.innerHTML and never touches what sits beside it. */
function fakeDom() {
  const host = { children: [], insertBefore(node) { this.children.push(node); } };
  /* root can appendChild, deliberately. The mistake worth catching is drawing
     the banner inside the view root, and a fake that cannot do the wrong thing
     turns that into a crash rather than a failed assertion — which passes for
     a red test while proving nothing about where the banner went. */
  const root = { innerHTML: "", inner: [], parentNode: host, appendChild(c) { this.inner.push(c); } };
  const make = () => ({
    className: "", textContent: "", style: {}, kids: [],
    appendChild(c) { this.kids.push(c); },
    get text() {
      return (this.textContent || "") + this.kids.map((k) => k.text !== undefined ? k.text : (k.textContent || "")).join("");
    },
  });
  return { host, root, document: { createElement: make, createTextNode: (t) => ({ textContent: t, text: t }) } };
}

function harness(file, hash) {
  const html = readFileSync(file, "utf8");
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const dom = fakeDom();
  const src =
    "var AUTH_ERR = ''; var AUTH_ERR_SHOWN = false;\n" +
    grab(js, "authError") + "\n" +
    grab(js, "noteAuthError") + "\n" +
    "return { authError: authError, noteAuthError: noteAuthError, seen: function () { return AUTH_ERR; } };";
  const api = new Function("location", "history", "document", "root", src)(
    { hash: hash, pathname: "/status" },
    { replaceState: function () {} },
    dom.document,
    dom.root
  );
  return { api, dom };
}

const PAGES = ["status.html", "seats.html", "hub.html", "pay.html", "admin.html"].filter(existsSync);
if (!PAGES.length) throw new Error("no portal pages built");

const EXPIRED = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

/* ── the message survives, on every page ─────────────────────────────────── */
for (const page of PAGES) {
  const { api, dom } = harness(page, EXPIRED);
  const msg = api.authError();
  is(page + ": the reason is decoded, not left as +signs", msg, "Email link is invalid or has expired");
  api.noteAuthError();
  is(page + ": a signed-in reader is told", dom.host.children.length, 1);
  /* Defaulted rather than indexed blind: when the banner goes somewhere it
     should not, this line is the one that runs next, and a crash here would
     bury the assertion above that actually explains what went wrong. */
  const shown = dom.host.children[0] || { text: "" };
  is(page + ": and told what it was about", shown.text.indexOf("Email link is invalid or has expired") > -1, true);
}

/* ── the properties that make it actually visible ────────────────────────── */
{
  const { api, dom } = harness("status.html", EXPIRED);
  api.authError();
  api.noteAuthError();
  /* Outside the root. A page redraws root wholesale, so anything inside it is
     gone by the time the reader gets there. */
  is("the banner sits beside the view root, not inside it", dom.root.innerHTML, "");
  is("nothing was drawn into the root, which render() would wipe", dom.root.inner.length, 0);
  is("it was drawn into the host beside it", dom.host.children.length, 1);
  const banner = dom.host.children[0] || { text: "" };
  is("it says the link failed, not just the server's words",
    banner.text.indexOf("That link did not work") > -1, true);
  is("it says nothing is lost, because nothing is",
    banner.text.indexOf("still signed in") > -1, true);
  /* GoTrue does not punctuate its reason, and joining it straight to the next
     sentence read as "has expired You are still signed in". */
  is("the server’s words end in a full stop before the next sentence",
    banner.text.indexOf("has expired. You are still") > -1, true);
}

/* Shown once. render() runs more than once on these pages — after setting a
   password, after a save — and a banner that stacks is its own bug. */
{
  const { api, dom } = harness("status.html", EXPIRED);
  api.authError();
  api.noteAuthError();
  api.noteAuthError();
  api.noteAuthError();
  is("three renders draw one banner", dom.host.children.length, 1);
  /* And it must still be there afterwards. Clearing it on display also
     emptied what the /seats redirect carries, so the banner appeared for the
     instant before the page navigated and the destination showed nothing. */
  is("the message survives being shown, so the redirect can carry it",
    api.seen(), "Email link is invalid or has expired");
}

/* ── silence when there is nothing to say ────────────────────────────────── */
{
  const { api, dom } = harness("status.html", "");
  is("no fragment, no message", api.authError(), "");
  api.noteAuthError();
  is("no fragment, no banner", dom.host.children.length, 0);
}
{
  const { api, dom } = harness("status.html", "#access_token=abc&type=recovery");
  is("a working link is not an error", api.authError(), "");
  api.noteAuthError();
  is("a working link draws no banner", dom.host.children.length, 0);
}

/* ── the redirect that used to drop it ───────────────────────────────────── */
{
  const html = readFileSync("status.html", "utf8");
  const at = html.indexOf('location.replace("/seats"');
  is("the /seats redirect carries the message with it",
    at > -1 && html.slice(at, at + 160).indexOf("AUTH_ERR") > -1, true);
}

console.log("");
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log((PAGES.length * 3 + 12) + " behaviours across " + PAGES.length + " portal pages");
