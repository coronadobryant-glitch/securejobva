/* Drives the admin rail's tab switch against a fake DOM.

   /admin is nine screens behind one rail, and only the panes were ever
   switched. The queue's toolbar and its backlog count sit outside
   .adm__canvas — above it, so they read as page furniture — and the switch
   never touched them. Every tab therefore opened carrying the queue's
   controls: a search for "name, email, country, region, track", filters for
   pipeline, skill, level and time, an "N of N" count, Download CVs, and an
   Export CSV that exports applicants. On Clients that sat under a heading
   reading Clients; on Timesheets, under Timesheets. Beside the heading,
   "4 waiting on you" — the applicant backlog — made the same claim about
   whatever screen you were on.

   Nothing failed. Every control worked exactly as written; it was answering
   about a screen you had left. That is why it survived being looked at: the
   bug is that the toolbar is still correct.

   Asserted by running the real handler, because the markup and the switch are
   written a thousand lines apart in build-portal.mjs and only ever meet in the
   browser.

   Run: node tools/test-admin-tabs.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

function grab(name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() in admin.html");
  let depth = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) return js.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

/* ── the fakes ─────────────────────────────────────────────────────────────
   Only what wireTabs() touches. It walks previousElementSibling looking for a
   .rail__k group heading, so the rail has to be a real ordered list of
   siblings rather than a map of buttons. */
function el(tag, attrs) {
  const node = {
    tag,
    _attrs: Object.assign({}, attrs),
    _classes: new Set((attrs && attrs.class ? attrs.class : "").split(" ").filter(Boolean)),
    textContent: (attrs && attrs.text) || "",
    hidden: false,
    previousElementSibling: null,
    getAttribute(a) { return a in this._attrs ? this._attrs[a] : null; },
    setAttribute(a, v) { this._attrs[a] = v; if (a === "hidden") this.hidden = true; },
    removeAttribute(a) { delete this._attrs[a]; if (a === "hidden") this.hidden = false; },
    closest(sel) { return sel === "[data-tab]" && "data-tab" in this._attrs ? this : null; },
    classList: {
      add(c) { node._classes.add(c); },
      remove(c) { node._classes.delete(c); },
      contains(c) { return node._classes.has(c); },
      toggle(c, on) { if (on) node._classes.add(c); else node._classes.delete(c); },
    },
  };
  return node;
}

/* The rail as it is built: three group headings, each followed by its tabs.
   The label carries its badge count welded on, exactly as the DOM has it. */
const RAIL = [
  ["k", "The queue"],
  ["tab", "apps", "Applications4"],
  ["tab", "cal", "Interviews"],
  ["tab", "inbox", "Messages"],
  ["k", "The business"],
  ["tab", "seats", "Seats3"],
  ["tab", "clients", "Clients"],
  ["tab", "place", "Placements"],
  ["k", "The team"],
  ["tab", "team", "Team"],
  ["tab", "hours", "Timesheets"],
  ["tab", "accts", "Accounts"],
];

const rail = RAIL.map(([kind, a, b]) =>
  kind === "k"
    ? el("div", { class: "rail__k", text: a })
    : el("button", { class: "rnav", "data-tab": a, text: b }));
rail.forEach((n, i) => { n.previousElementSibling = i ? rail[i - 1] : null; });

const tabs = {
  querySelectorAll: (sel) => (sel === "[data-tab]" ? rail.filter((n) => n.getAttribute("data-tab")) : []),
  addEventListener(_, fn) { this._fire = fn; },
};

const panes = ["apps", "cal", "inbox", "seats", "clients", "place", "team", "hours", "accts"]
  .map((p, i) => {
    const n = el("div", i === 0 ? { "data-pane": p } : { "data-pane": p, hidden: "" });
    n.hidden = i !== 0;
    return n;
  });

const heading = el("h2", { text: "Applications" });
const kicker = el("span", { class: "k", text: "The queue" });
const admBar = el("div", { class: "adm__bar" });
const admTopn = el("span", { class: "adm__topn" });

const root = { querySelectorAll: (sel) => (sel === "[data-pane]" ? panes : []) };

const document = {
  getElementById: (id) => (id === "tabs" ? tabs : null),
  querySelector(sel) {
    if (sel === ".adm__top h2") return heading;
    if (sel === ".adm__top .k") return kicker;
    if (sel === ".adm__bar") return admBar;
    if (sel === ".adm__topn") return admTopn;
    return null;
  },
};

/* ── run it ────────────────────────────────────────────────────────────── */
const wireTabs = new Function("document", "root", grab("wireTabs") + "; return wireTabs;")(document, root);
wireTabs();

let ok = 0;
const fails = [];
function is(what, got, want) {
  if (got === want) { ok++; console.log("  ok  " + what); return; }
  fails.push(what + " — got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  console.log("  FAIL " + what + " — got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
}

function click(tab) {
  const b = rail.find((n) => n.getAttribute("data-tab") === tab);
  if (!b) throw new Error("no tab " + tab + " on the rail");
  tabs._fire({ target: b });
}
const pane = (p) => panes.find((n) => n.getAttribute("data-pane") === p);

/* The state the page loads in. Nothing has been clicked, so this is the
   markup's own doing — and it is the one arrangement where the toolbar is
   telling the truth. */
is("the queue opens with its toolbar", admBar.hidden, false);
is("the queue opens with its backlog count", admTopn.hidden, false);

click("clients");
is("Clients shows its own pane", pane("clients").hidden, false);
is("Clients hides the queue", pane("apps").hidden, true);
is("Clients is titled Clients", heading.textContent, "Clients");
is("Clients sits under The business", kicker.textContent, "The business");
is("Clients does not offer a search for applicants", admBar.hidden, true);
is("Clients does not claim a backlog", admTopn.hidden, true);

/* The two that made it more than untidy. Export CSV and Download CVs act on
   the applicant queue wherever they are pressed, so a screen about money or
   hours must not be showing them. */
click("hours");
is("Timesheets does not offer Export CSV", admBar.hidden, true);
is("Timesheets does not claim a backlog", admTopn.hidden, true);
is("Timesheets is titled Timesheets", heading.textContent, "Timesheets");

click("place");
is("Placements does not offer Download CVs", admBar.hidden, true);
is("Placements is titled Placements", heading.textContent, "Placements");

/* The badge count must not weld itself to the title on the way back — the
   thing 044-era builds got wrong with a single backslash. */
click("seats");
is("Seats keeps its count out of its title", heading.textContent, "Seats");
is("Seats does not offer the queue toolbar", admBar.hidden, true);

/* And back. Hiding it is only half the fix; a toolbar that does not return is
   a queue you can no longer search. */
click("apps");
is("the queue gets its toolbar back", admBar.hidden, false);
is("the queue gets its backlog count back", admTopn.hidden, false);
is("the queue shows its own pane again", pane("apps").hidden, false);
is("the queue hides Clients again", pane("clients").hidden, true);
is("the queue keeps its count out of its title", heading.textContent, "Applications");

/* Exactly one pane at a time, on every stop of the round trip. */
for (const t of ["cal", "inbox", "team", "accts", "apps"]) {
  click(t);
  is("only " + t + " is showing", panes.filter((p) => !p.hidden).length, 1);
}

console.log("");
if (fails.length) {
  console.log(fails.length + " failed of " + (ok + fails.length));
  process.exit(1);
}
console.log(ok + " behaviours, nine tabs and one toolbar");
