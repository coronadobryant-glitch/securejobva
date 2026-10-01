/* Drives the notice board on /admin against a fake DOM and a fake API.
   Offline: reads admin.html and nothing else, sends nothing anywhere.

   The board looked right in the code and the policies and had never been run
   (F43): posting, publishing, taking down and pinning a notice were traced by
   reading, not tested. And it could not edit or delete at all (F42), so a
   typo meant taking a notice down and writing it again, and an old draft
   could never leave the list.

   So every button is pressed here, and what it sends is checked against what
   the database grants: insert with title, body, pinned, published_at and
   created_by (026, 083), update of those (026), delete for staff (sql/110).

   Run: node tools/test-admin-notices.mjs */
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
   A row is rebuilt from the markup drawNotices() writes, so a button that is
   not drawn cannot be pressed. Only what the board reads is modelled. */
function el(attrs) {
  const node = {
    _attrs: Object.assign({}, attrs),
    _on: {},
    value: "",
    hidden: "hidden" in attrs,
    textContent: attrs.text || "",
    checked: false,
    getAttribute(a) { return a in this._attrs ? this._attrs[a] : null; },
    setAttribute(a, v) { this._attrs[a] = v; },
    hasAttribute(a) { return a in this._attrs; },
    addEventListener(t, fn) { this._on[t] = fn; },
    click() { this._on.click && this._on.click(); },
    focus() {},
    classList: { add() {}, remove() {}, toggle() {} },
  };
  return node;
}

function buildBox() {
  const box = { rows: [], buttons: [], byId: {} };
  Object.defineProperty(box, "innerHTML", {
    set(h) {
      box._html = h;
      box.rows = [];
      box.buttons = [];
      box.byId = {};
      for (const id of ["nt-title", "nt-body", "nt-err", "nt-ok", "nt-pin", "nt-draft", "nt-pub"]) {
        if (h.indexOf('id="' + id + '"') > -1) box.byId[id] = el({ id });
      }
      const parts = h.split('<div class="row" data-notice="').slice(1);
      for (const part of parts) {
        const id = part.slice(0, part.indexOf('"'));
        const row = el({ "data-notice": id });
        const kids = {};
        for (const k of ["data-nt-ok", "data-nt-form", "data-nt-text", "data-nt-etitle", "data-nt-ebody"]) {
          if (part.indexOf(k) > -1) kids[k] = el(Object.assign({ [k]: "" },
            k === "data-nt-form" ? { hidden: "" } : {}));
        }
        const v = (k, re) => { const m = part.match(re); if (m && kids[k]) kids[k].value = m[1]; };
        v("data-nt-etitle", /data-nt-etitle[^>]*value="([^"]*)"/);
        v("data-nt-ebody", /data-nt-ebody[^>]*>([^<]*)</);
        row.querySelector = (sel) => kids[sel.slice(1, -1)] || null;
        box.rows.push(row);
        for (const k of ["data-nt-toggle", "data-nt-pin", "data-nt-edit", "data-nt-del"]) {
          const at = part.indexOf(k);
          if (at < 0) continue;
          const label = part.slice(part.indexOf(">", at) + 1, part.indexOf("</button>", at));
          const b = el({ [k]: "", text: label });
          b.closest = (sel) => (sel === "[data-notice]" ? row : null);
          box.buttons.push(b);
        }
      }
    },
    get() { return box._html; },
  });
  box.querySelectorAll = () => box.buttons;
  return box;
}

const sent = [];
let reloads = 0;
let staff = true;
let box;

const ctx = {
  ME: "staff@securejobva.com",
  can: (p) => staff && p === "applications.edit",
  esc: (s) => String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  when: (iso) => (iso ? String(iso).slice(0, 10) : ""),
  flash(el2, text, bad) { el2.textContent = text; el2.bad = !!bad; },
  why: (e) => String(e && e.message ? e.message : e),
  api(path, opts) { sent.push({ path, opts }); return Promise.resolve(null); },
  loadNotices() { reloads++; },
  document: { getElementById: (id) => box.byId[id] || null },
};

const lifted = new Function(
  ...Object.keys(ctx),
  grab("noticeRequest") + "\n" + grab("noticeMissing") + "\n" + grab("drawNotices") +
  "\nreturn { noticeRequest: noticeRequest, noticeMissing: noticeMissing, drawNotices: drawNotices };"
)(...Object.values(ctx));

let ok = 0;
const fails = [];
function is(what, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { ok++; console.log("  ok    " + what); return; }
  fails.push(what);
  console.log("  FAIL  " + what + "\n          got " + g + "\n          want " + w);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

const DRAFT = { id: "n-1", title: "Rota", body: "New rota from Monday.", pinned: false, published_at: null };
const LIVE = { id: "n-2", title: "Holiday", body: "Office shut Friday.", pinned: true, published_at: "2026-09-30T12:00:00Z" };

function draw(rows) {
  box = buildBox();
  lifted.drawNotices(box, rows);
  return box;
}
const btn = (b, rowId, attr) => b.buttons.find((x) => x.hasAttribute(attr) && x.closest("[data-notice]").getAttribute("data-notice") === rowId);

/* ── posting ─────────────────────────────────────────────────────────────── */
{
  sent.length = 0;
  const b = draw([]);
  b.byId["nt-title"].value = "  Payday  ";
  b.byId["nt-body"].value = "Paid on the 1st.";
  b.byId["nt-pin"].checked = true;
  b.byId["nt-pub"].click();
  await tick();
  is("Publish posts one notice", sent.length, 1);
  is("…to the notices table", sent[0] && sent[0].path, "notices");
  is("…as an insert", sent[0] && sent[0].opts.method, "POST");
  const body = sent[0] ? sent[0].opts.body : {};
  is("…with exactly the columns 026 and 083 take", Object.keys(body).sort(),
     ["body", "created_by", "pinned", "published_at", "title"]);
  is("…trimmed", body.title, "Payday");
  is("…pinned when ticked", body.pinned, true);
  is("…published now", typeof body.published_at === "string" && !isNaN(Date.parse(body.published_at)), true);
  is("…and the board reloads after", reloads > 0, true);

  sent.length = 0;
  b.byId["nt-draft"].click();
  await tick();
  is("Save as draft posts with no publish date", sent[0] && sent[0].opts.body.published_at, null);

  sent.length = 0;
  b.byId["nt-title"].value = "";
  b.byId["nt-pub"].click();
  await tick();
  is("no title sends nothing", sent.length, 0);
  is("…and says why", b.byId["nt-err"].textContent, "Give it a title — that is what people see first.");
  b.byId["nt-title"].value = "Title";
  b.byId["nt-body"].value = "   ";
  b.byId["nt-pub"].click();
  await tick();
  is("no words sends nothing", sent.length, 0);
}

/* ── publish, take down, pin ─────────────────────────────────────────────── */
{
  const b = draw([DRAFT, LIVE]);
  is("a draft offers Publish it", btn(b, "n-1", "data-nt-toggle").textContent, "Publish it");
  is("a live notice offers Take it down", btn(b, "n-2", "data-nt-toggle").textContent, "Take it down");
  is("a pinned notice offers Unpin", btn(b, "n-2", "data-nt-pin").textContent, "Unpin");

  sent.length = 0;
  btn(b, "n-1", "data-nt-toggle").click();
  await tick();
  is("Publish it patches that notice", sent[0] && sent[0].path, "notices?id=eq.n-1");
  is("…setting a publish date and nothing else",
     sent[0] && Object.keys(sent[0].opts.body), ["published_at"]);
  is("…to now", sent[0] && typeof sent[0].opts.body.published_at, "string");

  sent.length = 0;
  btn(b, "n-2", "data-nt-toggle").click();
  await tick();
  is("Take it down clears the publish date", sent[0] && sent[0].opts.body, { published_at: null });
  is("…as a patch", sent[0] && sent[0].opts.method, "PATCH");

  sent.length = 0;
  btn(b, "n-2", "data-nt-pin").click();
  await tick();
  is("Unpin sets pinned false", sent[0] && sent[0].opts.body, { pinned: false });
  sent.length = 0;
  btn(b, "n-1", "data-nt-pin").click();
  await tick();
  is("Pin sets pinned true", sent[0] && sent[0].opts.body, { pinned: true });
}

/* ── edit (F42) ──────────────────────────────────────────────────────────── */
{
  const b = draw([LIVE]);
  const e = btn(b, "n-2", "data-nt-edit");
  const row = e.closest("[data-notice]");
  is("every notice offers Edit", !!e, true);
  is("the edit boxes start shut", row.querySelector("[data-nt-form]").hidden, true);
  is("…filled with the title as it is", row.querySelector("[data-nt-etitle]").value, "Holiday");

  sent.length = 0;
  e.click();
  await tick();
  is("the first press only opens the boxes", sent.length, 0);
  is("…and shows them", row.querySelector("[data-nt-form]").hidden, false);
  is("…and the button now saves", e.textContent, "Save changes");

  row.querySelector("[data-nt-etitle]").value = "Holiday (corrected) ";
  row.querySelector("[data-nt-ebody]").value = "Office shut Friday and Monday.";
  e.click();
  await tick();
  is("the second press patches that notice", sent[0] && sent[0].path, "notices?id=eq.n-2");
  is("…with the title and the words, trimmed, and nothing else", sent[0] && sent[0].opts.body,
     { title: "Holiday (corrected)", body: "Office shut Friday and Monday." });

  sent.length = 0;
  row.querySelector("[data-nt-ebody]").value = "";
  e.click();
  await tick();
  is("an emptied notice is refused, not saved", sent.length, 0);
}

/* ── delete (F42, sql/110) ───────────────────────────────────────────────── */
{
  const b = draw([LIVE]);
  const d = btn(b, "n-2", "data-nt-del");
  is("every notice offers Delete", !!d, true);
  sent.length = 0;
  d.click();
  await tick();
  is("the first press only arms it", sent.length, 0);
  is("…and says what the second will do", d.textContent, "Press again to delete");
  d.click();
  await tick();
  is("the second press deletes that notice", sent[0] && [sent[0].path, sent[0].opts.method],
     ["notices?id=eq.n-2", "DELETE"]);
}

/* ── who sees what ───────────────────────────────────────────────────────── */
{
  staff = false;
  const b = draw([DRAFT]);
  is("without applications.edit there is no Edit", !!btn(b, "n-1", "data-nt-edit"), false);
  is("…and no Delete, which 110's policy would refuse", !!btn(b, "n-1", "data-nt-del"), false);
  staff = true;
}

/* ── the builder on its own ──────────────────────────────────────────────── */
{
  let threw = false;
  try { lifted.noticeRequest("archive", DRAFT); } catch (e) { threw = true; }
  is("an unknown action is refused rather than guessed at", threw, true);
  is("the id is encoded into the address",
     lifted.noticeRequest("delete", { id: "a b" })[0], "notices?id=eq.a%20b");
}

console.log("");
if (fails.length) {
  console.log(fails.length + " failed of " + (ok + fails.length));
  process.exit(1);
}
console.log(ok + " behaviours on the notice board");
