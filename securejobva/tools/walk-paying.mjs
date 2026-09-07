/* The paying half, walked against the real database.
 *
 * simulate.mjs walks the same ground and cannot walk this part of it. It hands
 * the render functions rows it builds itself, which is the right way to test a
 * renderer and no way at all to test the wiring that fills it — the lesson of
 * 623137d, where /admin's Times offered panel passed every one of its own
 * behaviours while the page could not receive a slot at all.
 *
 * So this one writes rows. Everything below happens in the database that
 * serves the site, through the same endpoints the pages use, and the numbers
 * it asserts are read back out rather than remembered.
 *
 * It exists because on 7 September 2026 every table on this half was empty —
 * no client had ever been created, no assistant had ever been placed, no week
 * had ever been worked and nothing had ever been paid. Phases 5 to 11 had
 * never run. The walk found the half sound, which is worth knowing and worth
 * being able to know again after somebody changes it.
 *
 *   node tools/walk-paying.mjs          reads what is there and checks it holds
 *   node tools/walk-paying.mjs --go     writes a client and walks the whole thing
 *
 * ==========================================================================
 * WHAT IT WILL AND WILL NOT TOUCH
 * ==========================================================================
 *
 * --go creates a client, a placement, two weeks of hours and a payment, and
 * removes every one of them again in a finally. It tracks what it made by id
 * and deletes by id: nothing here matches on a name, because a cleanup that
 * guesses its key is a cleanup that cannot tell success from a typo — which is
 * the mistake cleanup-test-data.sql opens by warning about.
 *
 * It never creates or deletes a person. Placing somebody needs an application
 * to point at, and the safe way to get one is to borrow an assistant who is
 * already hired rather than to invent and then erase a human being. So it
 * takes the address of one and refuses clearly if that person is not hired.
 *
 * It does NOT reach production quiet. Moving a placement to matched, trial or
 * ongoing fires notify_decision (035), and a week arriving or being decided
 * fires it too, so a full --go sends the borrowed assistant about five real
 * emails. That is deliberate and it is why --go is a flag rather than the
 * default: the only witness that any of this mail reads right is an inbox
 * somebody opens, the Resend key is send-only, and a walk that suppressed its
 * own mail would be quietly not testing the half of this that a person sees.
 * Borrow a test account, not somebody's real one. It says whose inbox it is
 * about to fill, and waits for --go to mean it.
 */
import { readFileSync, existsSync } from "node:fs";

/* ── where to talk to, and as whom ───────────────────────────────────────── */

const ENV = ".env.local";
function fromEnv(key) {
  if (!existsSync(ENV)) return null;
  const m = readFileSync(ENV, "utf8").match(new RegExp("^" + key + "=(.+)$", "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : null;
}

const URL_BASE = fromEnv("SUPABASE_URL");
const SERVICE = fromEnv("SUPABASE_SERVICE_ROLE_KEY");

/* The address of the assistant to borrow. An argument first, so nobody has to
   edit this file to walk it against their own test account. */
const asArg = process.argv.find((a) => a.startsWith("--as="));
const BORROW = asArg ? asArg.slice(5) : "glogin959@gmail.com";
const GO = process.argv.includes("--go");

if (!URL_BASE || !SERVICE) {
  console.log("\n  no service role key here — run this where .env.local is\n");
  process.exit(0);
}

const B = URL_BASE.replace(/\/$/, "") + "/rest/v1";
const H = { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json" };

async function api(path, opt = {}) {
  const r = await fetch(B + "/" + path, {
    method: opt.method || "GET",
    headers: Object.assign({}, H, opt.headers || {}),
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) {
    /* PostgREST puts the readable sentence in .message and the whole body in
       the text. 3b11f5a is the commit where printing the body instead of the
       sentence reached a person; this file does not repeat it. */
    const e = new Error((j && j.message) || t);
    e.status = r.status;
    throw e;
  }
  return j;
}

/* ── saying what happened ────────────────────────────────────────────────── */

let bad = 0, step = 0;
const act = (what) => console.log("\n  " + ++step + ". " + what);
const say = (k, v) => console.log("      " + String(k).padEnd(30) + " " + v);
function ok(what, cond, note) {
  console.log("      " + (cond ? "ok  " : "FAIL") + "  " + what + (note ? "  — " + note : ""));
  if (!cond) bad++;
}

/* A thing that is supposed to be refused. Passing is being told no; the note
   is what the database actually said, because a constraint that refuses for
   the wrong reason looks identical to one that refuses for the right one —
   setting a day to 99 hours to test that an approved week is locked trips the
   sanity cap instead and proves nothing. */
async function refused(what, expect, fn) {
  try {
    await fn();
    ok(what, false, "ALLOWED — nothing refused it");
  } catch (e) {
    /* Matched against the whole sentence and shortened only to print it. The
       first version tested the shortened copy, so two checks looking for a
       constraint name were reading a string the slice had cut in half —
       "client_payments_amount_s" — and failed against a database that had
       refused them correctly. A check that trims what it is about to compare
       is checking the trim. */
    const said = String(e.message);
    ok(what, said.includes(expect), said.slice(0, 90));
  }
}

/* ── reading what is there ───────────────────────────────────────────────── */

const money = (cents) => "$" + (cents / 100).toFixed(2);
const hoursOf = (w) => (w.timesheet_days || []).reduce((s, d) => s + Number(d.hours || 0), 0);

async function readHalf() {
  const [clients, places, bill, pay, weeks, paid, settled] = await Promise.all([
    api("clients?select=id,name"),
    api("placements?select=id,client_id,application_id,status,started_on,hours_per_week,trial_weeks"),
    api("placement_billing?select=placement_id,rate"),
    api("placement_pay?select=placement_id,rate"),
    api("timesheets?select=id,placement_id,application_id,week_starts_on,status,trial_week,timesheet_days(worked_on,hours)"),
    api("client_payments?select=id,client_id,amount_cents,paid_on,method"),
    api("client_payment_weeks?select=payment_id,timesheet_id")
  ]);
  return { clients, places, bill, pay, weeks, paid, settled };
}

/* What a client owes, worked out the way /seats works it out: approved weeks
   only, trial weeks free, rounded to the cent once at the end rather than a
   fraction at a time through a subtraction. Kept here rather than lifted out
   of the page because this is the arithmetic being checked, and a checker that
   imports the thing it checks agrees with it by construction. */
function owedCents(state, clientId) {
  const rate = {};
  state.bill.forEach((b) => (rate[b.placement_id] = Number(b.rate)));
  const mine = state.places.filter((p) => p.client_id === clientId).map((p) => p.id);
  let total = 0, free = 0, charged = 0;
  for (const w of state.weeks) {
    if (w.status !== "approved" || !mine.includes(w.placement_id)) continue;
    const h = hoursOf(w);
    if (w.trial_week) { free += h; continue; }
    charged += h;
    total += h * (rate[w.placement_id] || 0);
  }
  const paidCents = state.paid
    .filter((p) => p.client_id === clientId)
    .reduce((s, p) => s + Number(p.amount_cents || 0), 0);
  return { grand: total, cents: Math.round(total * 100), paidCents, charged, free };
}

/* ── the read-only pass ──────────────────────────────────────────────────── */

async function look() {
  act("What is on the paying half right now");
  const s = await readHalf();
  say("clients", String(s.clients.length));
  say("placements", String(s.places.length));
  say("weeks", String(s.weeks.length));
  say("payments", String(s.paid.length));

  if (!s.places.length) {
    console.log("\n      Nothing has ever been placed. There is nothing here to check —");
    console.log("      run this with --go to walk it, or read the header first.\n");
    return;
  }

  act("Every placement holds together");
  const rate = {};
  s.bill.forEach((b) => (rate[b.placement_id] = Number(b.rate)));
  const payRate = {};
  s.pay.forEach((p) => (payRate[p.placement_id] = Number(p.rate)));

  for (const p of s.places) {
    const who = p.id.slice(0, 8);
    ok("placement " + who + " points at a client that exists",
      s.clients.some((c) => c.id === p.client_id));
    ok("placement " + who + " has a billing rate", rate[p.id] !== undefined,
      rate[p.id] === undefined ? "hours on it cannot be priced" : "$" + rate[p.id]);
    /* The cut. It is the whole business, it is checked in both /admin paths
       and in neither table, so it is worth reading back rather than trusting. */
    if (rate[p.id] !== undefined && payRate[p.id] !== undefined) {
      ok("placement " + who + " pays less than it bills", payRate[p.id] <= rate[p.id],
        "$" + payRate[p.id] + " of $" + rate[p.id]);
    }
  }

  act("Every week belongs to the placement it is billed through");
  for (const w of s.weeks) {
    const p = s.places.find((x) => x.id === w.placement_id);
    ok("week of " + w.week_starts_on + " sits on a real placement", !!p);
    if (p) {
      ok("and on the same assistant as that placement",
        w.application_id === p.application_id,
        w.application_id === p.application_id ? undefined : "the week would be billed to the wrong business");
    }
    const monday = new Date(w.week_starts_on + "T00:00:00Z").getUTCDay();
    ok("week of " + w.week_starts_on + " starts on a Monday", monday === 1);
  }

  act("What each client owes, and what they have paid");
  for (const c of s.clients) {
    const b = owedCents(s, c.id);
    say(c.name, b.charged + " chargeable h, " + b.free + " free — " +
      money(b.cents) + " approved, " + money(b.paidCents) + " paid, " +
      money(b.cents - b.paidCents) + " left");
    /* Not an assertion that they are square: a client mid-cycle owes money and
       that is the normal state. What must never happen is a payment recorded
       against a client with nothing approved to pay for. */
    if (b.paidCents > 0) {
      ok(c.name + " has approved work behind what they paid", b.cents > 0,
        b.cents > 0 ? undefined : "money in against nothing owed");
    }
  }

  act("Every settled week is a week that client actually had");
  for (const link of s.settled) {
    const p = s.paid.find((x) => x.id === link.payment_id);
    const w = s.weeks.find((x) => x.id === link.timesheet_id);
    ok("payment " + link.payment_id.slice(0, 8) + " settles a week that exists", !!w);
    if (p && w) {
      const place = s.places.find((x) => x.id === w.placement_id);
      ok("and one belonging to the client who paid",
        !!place && place.client_id === p.client_id,
        place && place.client_id === p.client_id ? undefined
          : "one business's payment is marked against another's week");
    }
  }
}

/* ── the walk ────────────────────────────────────────────────────────────── */

async function walk() {
  const made = { client: null, place: null, weeks: [], payment: null };

  act("Borrowing an assistant rather than inventing one");
  const people = await api("applications?email=eq." + encodeURIComponent(BORROW) +
    "&select=id,name,email,status");
  if (!people.length) {
    console.log("\n      No application under " + BORROW + ".");
    console.log("      Pass --as=<address> for the test account to walk against.\n");
    return;
  }
  const who = people[0];
  say("borrowing", who.name + " <" + who.email + ">");
  say("status", who.status);
  if (who.status !== "hired") {
    console.log("\n      They are not hired, so nothing can be placed against them.");
    console.log("      This walk will not move a person's status to get around that —");
    console.log("      that is a decision about a human being, made in /admin.\n");
    return;
  }

  const live = await api("placements?application_id=eq." + who.id +
    "&status=neq.ended&select=id");
  if (live.length) {
    console.log("\n      They already have a live placement. placements_one_live_idx is");
    console.log("      unique on application_id, so this walk would be refused — and");
    console.log("      tearing down somebody else's placement to make room is not this");
    console.log("      tool's business.\n");
    return;
  }

  const weeks = await freeWeeks(who.id);
  if (!weeks) {
    console.log("\n      Every week for the last year already has a timesheet on it, so");
    console.log("      there is nowhere to put one. Walk against a quieter account.\n");
    return;
  }
  say("weeks to use", weeks[0] + " and " + weeks[1]);

  try {
    act("A client, and the contact details that are a second row since 039");
    made.client = (await api("clients", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: { name: "walk — " + new Date().toISOString().slice(0, 19) }
    }))[0];
    say("created", made.client.name);
    await api("client_private", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: {
        client_id: made.client.id, contact_name: "the walk",
        contact_email: null, billing_cycle: "weekly"
      }
    });
    ok("the business exists and can be read back",
      (await api("clients?id=eq." + made.client.id + "&select=id")).length === 1);

    act("Placing them, and setting both rates");
    made.place = (await api("placements", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: {
        application_id: who.id, client_id: made.client.id, status: "matched",
        started_on: weeks[0], hours_per_week: 40, trial_weeks: 1
      }
    }))[0];
    await api("placement_billing", { method: "POST", headers: { Prefer: "return=minimal" },
      body: { placement_id: made.place.id, rate: 7.75 } });
    await api("placement_pay", { method: "POST", headers: { Prefer: "return=minimal" },
      body: { placement_id: made.place.id, rate: 4.50 } });
    say("placed", "$7.75 billed, $4.50 paid");

    await refused("a second live placement for the same assistant", "placements_one_live_idx",
      () => api("placements", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { application_id: who.id, client_id: made.client.id, status: "matched",
                started_on: "2026-09-07", hours_per_week: 10 } }));

    act("The placement moves, and the assistant is told each time");
    for (const st of ["trial", "ongoing"]) {
      await api("placements?id=eq." + made.place.id, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: { status: st } });
      say("moved to", st);
    }

    act("The trial week — worked, sent, approved");
    made.weeks.push(await oneWeek(who.id, made.place.id, weeks[0],
      [8, 8, 8, 8, 8], true));
    act("The first chargeable week");
    made.weeks.push(await oneWeek(who.id, made.place.id, weeks[1],
      [8, 8, 8, 8, 7.5], false));

    act("What the weeks refuse");
    const tuesday = isoOf(new Date(new Date(weeks[1] + "T00:00:00Z").getTime() + 86400000));
    const farOff = isoOf(new Date(new Date(weeks[1] + "T00:00:00Z").getTime() + 60 * 86400000));
    const saturday = isoOf(new Date(new Date(weeks[1] + "T00:00:00Z").getTime() + 5 * 86400000));
    await refused("two timesheets for one assistant and one week", "timesheets_one_per_week",
      () => api("timesheets", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { application_id: who.id, placement_id: made.place.id,
                week_starts_on: weeks[1], status: "draft" } }));
    await refused("a week that does not start on a Monday", "starts_monday",
      () => api("timesheets", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { application_id: who.id, placement_id: made.place.id,
                week_starts_on: tuesday, status: "draft" } }));
    await refused("a day outside the week it belongs to", "outside the week",
      () => api("timesheet_days", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { timesheet_id: made.weeks[1], worked_on: farOff, hours: 4 } }));
    await refused("more hours in a day than a day has", "hours_sane",
      () => api("timesheet_days", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { timesheet_id: made.weeks[1], worked_on: saturday, hours: 30 } }));
    await refused("negative hours", "hours_sane",
      () => api("timesheet_days", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { timesheet_id: made.weeks[1], worked_on: saturday, hours: -4 } }));

    act("The bill, read back out of the database");
    let state = await readHalf();
    let b = owedCents(state, made.client.id);
    ok("the trial week is free", b.free === 40, b.free + " free hours");
    ok("only the chargeable week is charged", b.charged === 39.5, b.charged + " h");
    /* 39.5 × 7.75 is 306.125 exactly — a half cent, which is the whole reason
       the total is rounded once here rather than per week. quoted() on /seats
       exists for the same fifty cents. */
    ok("39.5 h at $7.75 comes to $306.13", b.cents === 30613, money(b.cents));

    act("Somebody pays, against the week it settles");
    made.payment = (await api("client_payments", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: { client_id: made.client.id, amount_cents: b.cents, paid_on: isoOf(new Date()),
              method: "bank_transfer", reference: "walk" }
    }))[0];
    await api("client_payment_weeks", { method: "POST", headers: { Prefer: "return=minimal" },
      body: { payment_id: made.payment.id, timesheet_id: made.weeks[1] } });

    await refused("a payment of nothing", "amount_sane",
      () => api("client_payments", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { client_id: made.client.id, amount_cents: 0, paid_on: isoOf(new Date()), method: "cash" } }));
    await refused("a payment method nobody offers", "method_check",
      () => api("client_payments", { method: "POST", headers: { Prefer: "return=minimal" },
        body: { client_id: made.client.id, amount_cents: 100, paid_on: isoOf(new Date()), method: "crypto" } }));

    state = await readHalf();
    b = owedCents(state, made.client.id);
    ok("and the client is square", b.cents - b.paidCents === 0,
      money(b.cents) + " approved, " + money(b.paidCents) + " paid");
  } finally {
    act("Putting it back");
    await teardown(made);
  }
}

/* Two consecutive Mondays this assistant does not already have a week for.
 *
 * The first version of this file used two fixed dates and was refused by
 * timesheets_one_per_week the first time it ran against an account that had
 * already been walked — that index is unique on (application_id,
 * week_starts_on), so the weeks have to dodge whatever is already there rather
 * than the placement's own. Which is the correct rule: a week belongs to a
 * person, and a person cannot work two of the same week for two businesses.
 *
 * The pair ENDS at the week given rather than starting from it, and that is
 * the fix for the second thing this got wrong: starting at this Monday put the
 * chargeable week seven days into the future, where 030 refuses hours outright
 * — "that week is outside the range hours may be recorded for". Which is
 * correct of it, and meant the walk was testing the range rule while claiming
 * to test the Monday rule. A pair rather than two singles because the walk
 * needs them adjacent: a trial week and the chargeable week after it. */
function mondayOf(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}
const isoOf = (d) => d.toISOString().slice(0, 10);

async function freeWeeks(appId) {
  const had = new Set((await api("timesheets?application_id=eq." + appId +
    "&select=week_starts_on")).map((w) => w.week_starts_on));
  let m = mondayOf(new Date());
  /* A year back is far enough that a real account would have to be full to
     defeat it, and near enough that failing says something true. */
  for (let i = 0; i < 52; i++) {
    const b = isoOf(m);
    const a = isoOf(new Date(m.getTime() - 7 * 86400000));
    if (!had.has(a) && !had.has(b)) return [a, b];
    m = new Date(m.getTime() - 7 * 86400000);
  }
  return null;
}

/* One week: created as a draft, filled in, sent, and approved — in that order,
   because the order is the thing being walked. A week that arrives already
   approved never crosses the boundary the client is on the other side of. */
async function oneWeek(appId, placeId, monday, hours, trial) {
  const ts = (await api("timesheets", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: { application_id: appId, placement_id: placeId, week_starts_on: monday,
            status: "draft", trial_week: trial }
  }))[0];
  const start = new Date(monday + "T00:00:00Z");
  for (let i = 0; i < hours.length; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    await api("timesheet_days", { method: "POST", headers: { Prefer: "return=minimal" },
      body: { timesheet_id: ts.id, worked_on: d, hours: hours[i] } });
  }
  await api("timesheets?id=eq." + ts.id, { method: "PATCH", headers: { Prefer: "return=minimal" },
    body: { status: "submitted", submitted_at: new Date().toISOString() } });
  await api("timesheets?id=eq." + ts.id, { method: "PATCH", headers: { Prefer: "return=minimal" },
    body: { status: "approved", decided_at: new Date().toISOString(), decided_by: "walk" } });

  const back = await api("timesheets?id=eq." + ts.id +
    "&select=status,trial_week,timesheet_days(hours)");
  const total = hoursOf(back[0]);
  say("week of " + monday, total + " h, " + back[0].status +
    (back[0].trial_week ? ", trial" : ""));
  ok("the hours went in as typed", total === hours.reduce((s, h) => s + h, 0), total + " h");
  return ts.id;
}

/* By id, and only what this run made. Children before parents, because the
   foreign keys are there on purpose and a delete that relies on a cascade is a
   delete that stops working the day somebody adds a restrict. */
async function teardown(made) {
  const gone = [];
  const drop = async (what, path) => {
    try { await api(path, { method: "DELETE", headers: { Prefer: "return=minimal" } }); gone.push(what); }
    catch (e) { console.log("      COULD NOT REMOVE " + what + ": " + e.message); bad++; }
  };
  if (made.payment) {
    await drop("the settlement", "client_payment_weeks?payment_id=eq." + made.payment.id);
    await drop("the payment", "client_payments?id=eq." + made.payment.id);
  }
  for (const id of made.weeks) {
    await drop("a week's days", "timesheet_days?timesheet_id=eq." + id);
    await drop("a week", "timesheets?id=eq." + id);
  }
  if (made.place) {
    await drop("the billing rate", "placement_billing?placement_id=eq." + made.place.id);
    await drop("the pay rate", "placement_pay?placement_id=eq." + made.place.id);
    await drop("the placement", "placements?id=eq." + made.place.id);
  }
  if (made.client) {
    await drop("the contact details", "client_private?client_id=eq." + made.client.id);
    await drop("the business", "clients?id=eq." + made.client.id);
  }
  say("removed", gone.length + " things");

  /* Said out loud rather than assumed. The whole point of a walk that writes
     is that it leaves nothing behind, and "I ran the deletes" is not the same
     claim as "there is nothing there". */
  if (made.client) {
    const left = await api("clients?id=eq." + made.client.id + "&select=id");
    ok("the walk's client is gone", left.length === 0,
      left.length ? "STILL THERE — remove it by hand: " + made.client.id : undefined);
  }
}

/* ── go ──────────────────────────────────────────────────────────────────── */

console.log("\nthe paying half — " + URL_BASE.replace(/^https?:\/\//, ""));

if (GO) {
  console.log("\n  Writing. This sends about five real emails to " + BORROW + ",");
  console.log("  because moving a placement and deciding a week both notify the");
  console.log("  assistant, and a walk that silenced its own mail would not be");
  console.log("  walking the half of this a person sees.");
  await walk();
} else {
  await look();
  console.log("\n  Read-only. --go writes a client and walks the whole thing," +
    "\n  and says whose inbox it will fill before it does.");
}

console.log("\n" + (bad ? "  " + bad + " FAILED\n" : "  the paying half holds\n"));
process.exit(bad ? 1 : 0);
