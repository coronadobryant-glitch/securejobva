/* Drives the admin page's save() against a fake DOM and a fake API.

   save() is the one function on that page where a mistake is invisible: it
   decides what changed, builds two or three writes, and reports. A wrong
   comparison there means a change that looks saved and was never sent, which
   is exactly the complaint that prompted this.

   Run: node tools/test-admin-save.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

function grab(name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "()");
  let depth = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) return js.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

/* ── the fakes ─────────────────────────────────────────────────────────────
   Only what save() actually touches. A real DOM would not make this a better
   test; it would make the failures harder to read. */
function fakeRow(fields) {
  const els = {};
  for (const [sel, value] of Object.entries(fields)) {
    els[sel] = typeof value === "boolean"
      ? { checked: value, getAttribute: () => sel.replace(/[[\]]/g, "") }
      : { value: value, getAttribute: (a) => (a === "data-score" ? sel.match(/"([^"]+)"/)?.[1] : null) };
  }
  return {
    _attrs: {},
    getAttribute(a) { return a === "data-id" ? "app-1" : this._attrs[a] || null; },
    setAttribute(a, v) { this._attrs[a] = v; },
    removeAttribute(a) { delete this._attrs[a]; },
    querySelector(sel) {
      if (sel === "[data-ok]") return { textContent: "", classList: { add() {}, remove() {}, toggle() {} } };
      if (sel === "[data-pill]") return { className: "", textContent: "" };
      return els[sel] || null;
    },
    querySelectorAll(sel) {
      return Object.keys(els).filter((k) => k === sel).map((k) => els[k]);
    },
    replaceWith() {}
  };
}

const sent = [];
const ctx = {
  ALL: [],   /* replaced in place, never reassigned — see note below */
  ME: "staff@securejobva.com",
  SKILLS: [
    ["skill_english", "English"], ["skill_customer", "Customer service"],
    ["skill_data_entry", "Data entry"], ["skill_social", "Social media"],
    ["skill_bookkeeping", "Bookkeeping"]
  ],
  LABEL: { applied: "Applied", assessment: "Assessment" },
  api(path, opts) { sent.push({ path, opts }); return Promise.resolve(null); },
  flash() {},
  why(e) { return String(e); },
  rowHtml() { return "<div></div>"; },
  drawCalendar() {},
  fromLocalDateTime(v) { return v ? new Date(v).toISOString() : null; },
  document: { createElement: () => ({ innerHTML: "", firstChild: {} }) }
};

const save = new Function(
  ...Object.keys(ctx),
  grab("save") + "\nreturn save;"
)(...Object.values(ctx));

let failed = 0;
const check = (name, fn) => {
  sent.length = 0;
  try { fn(); console.log("  ok    " + name); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n          " + e.message); }
};
const body = (table) => (sent.find((s) => s.path.startsWith(table)) || {}).opts?.body;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ── a stage change is sent ── */
check("changing the stage writes applications", () => {
  ctx.ALL.length = 0; ctx.ALL.push(...[{ id: "app-1", status: "applied", pipeline: "new" }]);
  save(fakeRow({ "[data-status]": "assessment" }));
  const b = body("applications?");
  assert(b, "nothing was sent to applications");
  assert(b.status === "assessment", "wrong status: " + JSON.stringify(b));
  assert(b.status_changed_at, "status_changed_at was not stamped");
});

/* ── an unchanged value is not ── */
check("re-saving an unchanged stage sends nothing", () => {
  ctx.ALL.length = 0; ctx.ALL.push(...[{ id: "app-1", status: "applied", pipeline: "new" }]);
  save(fakeRow({ "[data-status]": "applied" }));
  assert(sent.length === 0, "sent " + sent.length + " write(s) for no change");
});

/* ── the pipeline goes to the other table ── */
check("changing the pipeline writes application_tracking", () => {
  ctx.ALL.length = 0; ctx.ALL.push(...[{ id: "app-1", status: "applied", pipeline: "new" }]);
  save(fakeRow({ "[data-pipe]": "contacted" }));
  const b = body("application_tracking");
  assert(b, "nothing was sent to application_tracking");
  assert(b.pipeline === "contacted", "wrong pipeline: " + JSON.stringify(b));
  assert(b.application_id === "app-1", "the row id was not carried");
});

/* ── the thing that must not regress: scored_by is the database's job ── */
check("the page never sends scored_by", () => {
  ctx.ALL.length = 0; ctx.ALL.push(...[{ id: "app-1", status: "applied", pipeline: "new", score_english: null }]);
  const row = fakeRow({ "[data-score]": "7" });
  row.querySelectorAll = (sel) =>
    sel === "[data-score]"
      ? [{ value: "7", getAttribute: () => "score_english" }]
      : [];
  save(row);
  const b = body("application_tracking");
  assert(b, "nothing was sent");
  assert(b.score_english === 7, "score not sent as a number: " + JSON.stringify(b));
  assert(!("scored_by" in b), "the page sent scored_by — the trigger owns that");
  assert(!("scored_at" in b), "the page sent scored_at — the trigger owns that");
});

/* ── marking contacted stamps who and when ── */
check("mark contacted stamps the time and the person", () => {
  ctx.ALL.length = 0; ctx.ALL.push(...[{ id: "app-1", status: "applied", pipeline: "new" }]);
  const row = fakeRow({ "[data-pipe]": "new" });
  row.setAttribute("data-mark-contacted", "1");
  save(row);
  const b = body("application_tracking");
  assert(b, "nothing was sent");
  assert(b.pipeline === "contacted", "did not move to contacted");
  assert(b.last_contacted_at, "no timestamp");
  assert(b.contacted_by === ctx.ME, "wrong person: " + b.contacted_by);
});

/* ── writes are minimal, so an ungranted column cannot refuse the statement ── */
check("writes ask for nothing back", () => {
  ctx.ALL.length = 0; ctx.ALL.push(...[{ id: "app-1", status: "applied", pipeline: "new" }]);
  save(fakeRow({ "[data-status]": "assessment", "[data-pipe]": "reviewed" }));
  assert(sent.length > 0, "nothing was sent");
  for (const s of sent) {
    const pref = (s.opts.headers || {}).Prefer || "";
    assert(/return=minimal/.test(pref),
      s.path + " does not ask for return=minimal — returning a row reads every " +
      "column and one ungranted column refuses the whole write");
  }
});

console.log("\n" + (failed ? failed + " FAILED" : "all admin save checks passed"));
process.exit(failed ? 1 : 0);
