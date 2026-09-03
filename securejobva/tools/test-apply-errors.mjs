/* Drives the apply form's change handler against a fake form.

   Validation on steps 1 and 2 runs on Continue and nowhere else, so the red it
   writes stays until Continue is pressed a second time. Tick the track you
   were just told to tick and "Choose at least one track you are applying for."
   is still sitting under the ticked box; pick the experience you were just
   told to pick and the same. The form asks a question, is answered, and goes
   on saying it was not.

   The page already knows this is wrong in two other places — text fields clear
   as you type, and the DISC grid clears on change with a comment above it
   saying why — which is what makes the chip groups worth fixing rather than
   explaining.

   The skills grid is the one that cannot simply be blanked: "3 ratings are
   missing" with two missing is still red and now also wrong. So it is
   refreshed, and only once it has already spoken — a grid that turns red
   before anybody has pressed Continue is a worse form than the one being
   fixed, and that is asserted here too.

   Run: node tools/test-apply-errors.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("careers.html", "utf8");

/* The handler is anonymous and wired with addEventListener, so it is pulled
   out by the one name only it declares. */
const from = html.indexOf("  var GROUP_ERR = ");
if (from < 0) throw new Error("no GROUP_ERR in careers.html — has the change handler been renamed?");
const end = html.indexOf("\n  });", html.indexOf('form.addEventListener("change"', from));
if (end < 0) throw new Error("could not find the end of the change handler");
const src = html.slice(from, end + 6);

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
};

/* ── the fakes ───────────────────────────────────────────────────────────── */
function build({ checked = [], skills = [], errors = {} }) {
  const slots = {};
  for (const [id, text] of Object.entries(errors)) slots[id] = { textContent: text };

  const form = {
    _handler: null,
    addEventListener(kind, fn) { if (kind === "change") this._handler = fn; },
    querySelector(sel) {
      let m = sel.match(/^\[name=(.+)\]:checked$/);
      if (m) return checked.includes(m[1]) ? {} : null;
      m = sel.match(/^\[data-skill-err=(.+)\]$/);
      if (m) return skills.includes(m[1]) ? {} : null;
      return null;
    },
  };
  const document = { getElementById: (id) => slots[id] || null };

  let refreshed = 0;
  const validSkills = () => { refreshed++; };

  new Function("form", "document", "validSkills", src)(form, document, validSkills);
  return {
    fire: (name) => form._handler({ target: { name } }),
    text: (id) => (slots[id] ? slots[id].textContent : null),
    refreshed: () => refreshed,
  };
}

/* ── the four chip groups ────────────────────────────────────────────────── */
for (const [name, id, said] of [
  ["track", "err-track", "Choose at least one track you are applying for."],
  ["exp", "err-exp", "How long have you done this kind of work?"],
  ["shift", "err-shift", "Pick at least one shift you can hold."],
  ["speed", "err-speed", "Tell us your connection speed."],
]) {
  const t = build({ checked: [name], errors: { [id]: said } });
  t.fire(name);
  is("answering " + name + " takes its error down", t.text(id), "");
}

/* The half-answered case. A group that fires change while still holding no
   answer has not been answered — clearing there would hide a true message. */
{
  const t = build({ checked: [], errors: { "err-track": "Choose at least one track you are applying for." } });
  t.fire("track");
  is("an unanswered group keeps its error",
    t.text("err-track"), "Choose at least one track you are applying for.");
}

/* One group's answer is not another's. */
{
  const t = build({
    checked: ["track"],
    errors: { "err-track": "Choose at least one track.", "err-exp": "How long have you done this?" },
  });
  t.fire("track");
  is("answering track clears track", t.text("err-track"), "");
  is("answering track leaves exp alone", t.text("err-exp"), "How long have you done this?");
}

/* ── the skills grid ─────────────────────────────────────────────────────── */
{
  const t = build({
    checked: ["skill_english"],
    skills: ["skill_english"],
    errors: { "err-skills": "3 ratings are missing: English, Data entry and Bookkeeping." },
  });
  t.fire("skill_english");
  is("rating a skill refreshes the grid rather than blanking it", t.refreshed(), 1);
}
{
  /* Nothing has been said yet, so nothing may turn red. */
  const t = build({
    checked: ["skill_english"],
    skills: ["skill_english"],
    errors: { "err-skills": "" },
  });
  t.fire("skill_english");
  is("a silent grid stays silent until Continue is pressed", t.refreshed(), 0);
}

/* ── anything else on the form ───────────────────────────────────────────── */
{
  const t = build({ checked: ["ap-name"], errors: { "err-track": "Choose at least one track." } });
  t.fire("ap-name");
  is("an unrelated field clears nothing", t.text("err-track"), "Choose at least one track.");
}
{
  const t = build({ checked: [], errors: {} });
  t.fire(undefined);
  is("a nameless control does not throw", true, true);
}

console.log("");
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("11 behaviours, four chip groups and the skills grid");
