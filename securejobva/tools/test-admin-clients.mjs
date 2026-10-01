/* Drives the client and placement controls on /admin against a fake DOM and
   a fake API. Offline: reads admin.html, sends nothing.

   What is held here:

     the match form       one place_assistant() call with every field, not
                          the old chain of five requests that could stop
                          half-way (F39), and the seat request it came from
                          (F15)
     ending a placement   the day in the Last day box goes to end_placement(),
                          never today stamped behind the screen (F28), and
                          the answer comes back in words
     the client list      what update_client() answers is said back, and a
                          missing address is shown as the problem it is
                          (F37, F40)
     a removed logo       its file in storage is found from its address, and
                          only ever inside our own bucket (F45)

   Run: node tools/test-admin-clients.mjs */
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

let ok = 0;
const fails = [];
function is(what, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { ok++; console.log("  ok    " + what); return; }
  fails.push(what);
  console.log("  FAIL  " + what + "\n          got " + g + "\n          want " + w);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function el(id, value) {
  return {
    id, value: value === undefined ? "" : value, textContent: "", disabled: false, _on: {}, _attrs: {},
    addEventListener(t, fn) { this._on[t] = fn; },
    fire(t) { this._on[t] && this._on[t](); },
    setAttribute(a, v) { this._attrs[a] = v; }, removeAttribute(a) { delete this._attrs[a]; },
    getAttribute(a) { return a in this._attrs ? this._attrs[a] : null; },
    hasAttribute(a) { return a in this._attrs; },
    focus() {}, classList: { add() {}, remove() {}, toggle() {} },
  };
}

const TODAY = "2026-10-01";
const sent = [];
let answer = { ok: true, value: null };
const asked = [];
const reloads = [];

const base = {
  esc: (s) => String(s === null || s === undefined ? "" : s),
  when: (d) => "«" + d + "»",
  todayCentral: () => TODAY,
  flash(e, t, bad) { e.textContent = t; e.bad = !!bad; },
  why: (e) => String(e && e.message ? e.message : e),
  window: { confirm(m) { asked.push(m); return true; } },
  api(path, opts) {
    sent.push({ path, opts });
    return answer.ok ? Promise.resolve(answer.value) : Promise.reject(new Error(answer.value));
  },
  loadPlacements(...a) { reloads.push(["placements", ...a]); },
  loadSeats() { reloads.push(["seats"]); },
  SB: "https://abc.supabase.co",
};

/* ── the words ───────────────────────────────────────────────────────────── */
{
  const f = new Function(...Object.keys(base),
    grab("endSays") + grab("endAsk") + grab("clientSays") + grab("logoPath") +
    "\nreturn { endSays: endSays, endAsk: endAsk, clientSays: clientSays, logoPath: logoPath };")(
    ...Object.values(base));

  is("ended reads Ended", f.endSays("ended"), "Ended");
  is("a future end reads as the day", f.endSays("ends after 2026-10-31"), "Ends after «2026-10-31»");
  is("taking it back says so", f.endSays("no end date"), "End taken back");

  is("ending today says the client is emailed now",
     /client contact straight away/.test(f.endAsk({ status: "trial" }, "Ana", TODAY)), true);
  is("…and that she is not",
     /She is not emailed/.test(f.endAsk({ status: "trial" }, "Ana", TODAY)), true);
  is("a day ahead says it ends by itself after",
     /ends by itself the morning after/.test(f.endAsk({ status: "trial" }, "Ana", "2026-10-20")), true);
  is("correcting an ended one mails nobody again",
     /Nobody is emailed again/.test(f.endAsk({ status: "ended" }, "Ana", "2026-09-20")), true);

  is("a saved address with somebody placed says where the invite went",
     f.clientSays("saved, invite sent", "a@b.co"), "Saved, and their invite went to a@b.co");
  is("a plain save says Saved", f.clientSays("saved", "a@b.co"), "Saved");

  is("a logo in our bucket gives its path",
     f.logoPath("https://abc.supabase.co/storage/v1/object/public/client-logos/logo-1.png"), "logo-1.png");
  is("somebody else's address gives nothing",
     f.logoPath("https://evil.example/storage/v1/object/public/client-logos/logo-1.png"), null);
  is("a path that climbs out gives nothing",
     f.logoPath("https://abc.supabase.co/storage/v1/object/public/client-logos/../applicant-docs/x"), null);
}

/* ── the match form (F39, F15) ───────────────────────────────────────────── */
{
  const ids = {
    "pl-client": el("pl-client", "__new"), "pl-new": el("pl-new"), "pl-req": el("pl-req", ""),
    "pl-go": el("pl-go"), "pl-err": el("pl-err"), "pl-ok": el("pl-ok"),
    "pl-start": el("pl-start", "2026-10-06"), "pl-bill": el("pl-bill", "7.75"), "pl-pay": el("pl-pay", "4.50"),
    "pl-who": el("pl-who", "app-1"), "pl-hours": el("pl-hours", "30"), "pl-trial": el("pl-trial", "1"),
    "pl-cname": el("pl-cname", ""), "pl-cwho": el("pl-cwho", ""), "pl-cmail": el("pl-cmail", ""),
    "pl-cycle": el("pl-cycle", "monthly"),
  };
  const ctx = Object.assign({}, base, {
    document: { getElementById: (id) => ids[id] || null },
    CLIENTS: [{ id: "c-1", name: "Rosehill" }],
    SEAT_OPEN: [{ id: "req-1", company: "Acme Plumbing", name: "Jo Bloggs", email: "jo@acme.test" }],
  });
  const wire = new Function(...Object.keys(ctx), grab("wirePlacementForm") + "\nreturn wirePlacementForm;")(
    ...Object.values(ctx));
  wire();

  /* Picking the request fills in the new client, without overwriting. */
  ids["pl-cwho"].value = "Already typed";
  ids["pl-req"].value = "req-1";
  ids["pl-req"].fire("change");
  is("a seat request fills the business name", ids["pl-cname"].value, "Acme Plumbing");
  is("…and the address", ids["pl-cmail"].value, "jo@acme.test");
  is("…and leaves a box already typed in alone", ids["pl-cwho"].value, "Already typed");

  sent.length = 0;
  answer = { ok: true, value: "pl-9" };
  ids["pl-go"].fire("click");
  await tick();
  is("matching is one request", sent.length, 1);
  is("…to place_assistant", sent[0] && sent[0].path, "rpc/place_assistant");
  is("…carrying every field, the new client and the request", sent[0] && sent[0].opts.body, {
    application: "app-1", client: null, business: "Acme Plumbing", contact: "Already typed",
    address: "jo@acme.test", cycle: "monthly", starts_on: "2026-10-06", hours: 30, trial_weeks: 1,
    bill_rate: 7.75, pay_rate: 4.5, from_request: "req-1",
  });
  is("…and the lists reload after", reloads.some((r) => r[0] === "placements"), true);

  /* An existing client sends no new-client fields. */
  sent.length = 0;
  ids["pl-client"].value = "c-1";
  ids["pl-req"].value = "";
  ids["pl-go"].disabled = false;
  ids["pl-go"].fire("click");
  await tick();
  is("an existing client is sent by id with no new-client fields",
     sent[0] && [sent[0].opts.body.client, sent[0].opts.body.business, sent[0].opts.body.address,
                 sent[0].opts.body.from_request], ["c-1", null, null, null]);

  /* Refusals, before and after the round trip. */
  sent.length = 0;
  ids["pl-bill"].value = "7.755";
  ids["pl-go"].disabled = false;
  ids["pl-go"].fire("click");
  await tick();
  is("a rate past the cent is refused before it is sent", sent.length, 0);
  is("…in the words the database would use", ids["pl-err"].textContent, "A rate is dollars and cents: 7.75, not 7.755.");

  ids["pl-bill"].value = "7.75";
  answer = { ok: false, value: "Ana already has a live placement. End it before matching her again." };
  ids["pl-go"].disabled = false;
  ids["pl-go"].fire("click");
  await tick();
  await tick();
  is("a refusal from place_assistant is shown as its sentence",
     ids["pl-err"].textContent, "Ana already has a live placement. End it before matching her again.");
  is("…and the button comes back", ids["pl-go"].disabled, false);
}

/* ── ending a placement (F28) ───────────────────────────────────────────── */
{
  const mkRow = (id, day) => {
    const okEl = el("ok");
    const endEl = el("end", day);
    const name = el("n"); name.textContent = "Ana";
    const row = el("row");
    row._attrs["data-place"] = id;
    row.querySelector = (s) => ({ "[data-pl-ok]": okEl, "[data-pl-end]": endEl, ".row__n": name })[s] || null;
    return { row, okEl, endEl };
  };
  const r1 = mkRow("pl-1", "2026-09-28");
  const go = el("go"); go._attrs["data-pl-end-go"] = ""; go.closest = () => r1.row;
  const r2 = mkRow("pl-2", "");
  const undo = el("undo"); undo._attrs["data-pl-unend"] = ""; undo.closest = () => r2.row;
  const box = {
    querySelectorAll: (sel) => (sel === "[data-pl-end-go], [data-pl-unend]" ? [go, undo] : []),
  };
  const ctx = Object.assign({}, base, {
    PLACEMENTS: [{ id: "pl-1", status: "trial" }, { id: "pl-2", status: "trial", ended_on: "2026-10-20" }],
    RATES: {}, PLACE_MAIL: {}, PLACE_LABEL: {},
    endAsk: () => "sure?", endSays: (t) => "said " + t, document: {},
  });
  const wire = new Function(...Object.keys(ctx), grab("wirePlacementRows") + "\nreturn wirePlacementRows;")(
    ...Object.values(ctx));
  wire(box);

  sent.length = 0;
  reloads.length = 0;
  asked.length = 0;
  answer = { ok: true, value: "ended" };
  go.fire("click");
  await tick();
  is("End on this day asks first", asked.length, 1);
  is("…then sends the day in the box, not today",
     sent[0] && [sent[0].path, sent[0].opts.body], ["rpc/end_placement", { placement: "pl-1", last_day: "2026-09-28" }]);
  is("…and says back what the database did, on the redrawn row",
     reloads[0], ["placements", "said ended", null, "pl-1"]);

  sent.length = 0;
  answer = { ok: true, value: "no end date" };
  undo.fire("click");
  await tick();
  is("Take back the end sends no day",
     sent[0] && sent[0].opts.body, { placement: "pl-2", last_day: null });

  sent.length = 0;
  r1.endEl.value = "";
  go.disabled = false;
  go.fire("click");
  await tick();
  is("an empty Last day sends nothing", sent.length, 0);
}

console.log("");
if (fails.length) {
  console.log(fails.length + " failed of " + (ok + fails.length));
  process.exit(1);
}
console.log(ok + " behaviours for clients, matching and ending");
