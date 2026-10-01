/* Does every email this database asks for leave the same way, carrying the
   same secret, from the one place it is kept — and is that place shut?

   sql/094 put the webhook secret in one private row, 095 put an outbox and a
   retry job in front of every post, and 096 moved every sender onto both.
   Each of those is undone by one careless later file, and none of the undoing
   would show: a new trigger that calls net.http_post with its own copy of the
   secret works perfectly until the day the secret changes, and then that one
   kind of email stops with nothing anywhere saying so. That is F52, and it is
   exactly the kind of thing a later migration reintroduces by copying an old
   one.

   So this reads the LATEST definition of every function in sql/ — the one the
   database ends up running, since a later `create or replace` wins — and
   asserts:

     - only the outbox's two functions call net.http_post at all
     - no function body holds a quoted value after x-webhook-secret
     - no trigger is a supabase_functions.http_request webhook any more
     - the secret's reader and the outbox's functions are granted to nobody
     - every try carries the outbox row's idempotency key
     - every file from 094 on pastes as committed (no placeholder) and ends on
       one check query, after its stamp

   And the behaviour fixes that ride on the same files: the pass that never
   moved on (097), the staff alerts (098, 099), the reason a placement
   interview moved (099, 100), the consent rule (101), a client's name (104),
   keeping her on (108) and a placement that never started (109).

   Nothing here touches the network or the database.

   Run: node tools/test-sql-senders.mjs */
import { readFileSync, readdirSync } from "node:fs";

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

const FILES = readdirSync("sql")
  .filter((f) => /^\d{3}-.*\.sql$/.test(f) && !f.endsWith(".local.sql"))
  .sort();
const TEXT = new Map(FILES.map((f) => [f, readFileSync("sql/" + f, "utf8").replace(/\r\n/g, "\n")]));
const ALL = FILES.map((f) => TEXT.get(f)).join("\n");

/* Comments out, line by line, so prose about a grant is never read as one. */
const code = (s) => s.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const CODE = code(ALL);

/* The last definition of each public function, as the database runs it. */
const latest = new Map();
for (const f of FILES) {
  for (const m of TEXT.get(f).matchAll(
    /create\s+or\s+replace\s+function\s+public\.(\w+)[\s\S]*?\$fn\$([\s\S]*?)\$fn\$;/gi)) {
    latest.set(m[1], { file: f, body: m[2] });
  }
}

/* The last definition of each named trigger. */
const triggers = new Map();
for (const f of FILES) {
  for (const m of TEXT.get(f).matchAll(/create\s+trigger\s+"?([\w-]+)"?([\s\S]*?);/gi)) {
    triggers.set(m[1], { file: f, def: m[2] });
  }
}

const highest = FILES[FILES.length - 1];
ok("094 is in the folder", FILES.some((f) => f.startsWith("094-")), true);
ok("096 is in the folder", FILES.some((f) => f.startsWith("096-")), true);

console.log("\n  One way out");

const posters = [...latest].filter(([, v]) => /net\.http_post\s*\(/.test(code(v.body))).map(([n]) => n).sort();
ok("only the outbox calls net.http_post", posters.join(", "), "notify_outbox_post, notify_send",
   "everything else calls notify_send()");

const ownCopy = [...latest]
  .filter(([, v]) => /x-webhook-secret'\s*,\s*'[^']/.test(v.body))
  .map(([n, v]) => n + " (" + v.file + ")");
ok("no function holds its own copy of the secret", ownCopy.join(", "), "");

for (const name of ["notify-applications", "notify-seat-requests", "notify-contact-messages"]) {
  const t = triggers.get(name);
  ok(name + " is a plain trigger on notify_form()",
     !!t && /execute\s+function\s+public\.notify_form\(\)/i.test(t.def) && !/http_request/.test(t.def),
     true, t ? t.file : "missing");
}

const webhooks = [...triggers].filter(([, v]) => /supabase_functions\.http_request/.test(v.def)).map(([n]) => n);
ok("no trigger is a dashboard webhook any more", webhooks.join(", "), "");

for (const name of ["notify_decision", "notify_swap", "post_interview_note", "notify_payment_receipt",
                    "invite_the_client", "notify_form", "post_interview_note_with_reason"]) {
  const v = latest.get(name);
  ok(name + " posts through notify_send", !!v && /public\.notify_send\(/.test(v.body), true, v && v.file);
}

console.log("\n  The secret, kept");

const D094 = TEXT.get(FILES.find((f) => f.startsWith("094-"))) || "";
ok("094 copies it out of notify_decision", /proname = 'notify_decision'/.test(D094), true);
ok("094 refuses to store the placeholder", /raise exception[\s\S]{0,200}nothing to copy/.test(D094), true);
ok("094 leaves a filled row alone on a re-run", /if exists \(select 1 from private\.webhook_secret/.test(D094), true);
ok("the reader is revoked from everybody",
   /revoke all on function private\.webhook_secret\(\) from public, anon, authenticated;/.test(D094), true);
ok("the reader is granted to nobody",
   /grant[^;]*on\s+function\s+private\.webhook_secret/i.test(CODE), false);
ok("the schema is closed", /revoke all on schema private from public, anon, authenticated;/.test(D094), true);

/* The placeholder, written whole, would be pasted, would fail every 401, and
   would be the reason the file was written in the first place. From 094 on
   nothing is filled in by hand. */
for (const f of FILES.filter((x) => Number(x.slice(0, 3)) >= 94)) {
  ok(f + " has no placeholder to fill in", TEXT.get(f).includes("__WEBHOOK_SECRET__"), false);
}

console.log("\n  The outbox");

const post = latest.get("notify_outbox_post");
ok("every try carries the row's key", !!post && /'x-idempotency-key',\s*row_\.idempotency_key/.test(post.body), true);
ok("every try reads the stored secret", !!post && /private\.webhook_secret\(\)/.test(post.body), true);
ok("the key is made once, when the row is written",
   /gen_random_uuid\(\)::text/.test((latest.get("notify_send") || {}).body || ""), true);
for (const fn of ["notify_send(jsonb, text, text)", "notify_outbox_post(bigint)", "notify_outbox_sweep()"]) {
  const name = fn.replace(/\(.*/, "");
  ok(name + " is granted to nobody",
     new RegExp("grant\\s+execute\\s+on\\s+function\\s+public\\." + name + "\\b", "i").test(CODE), false);
}
ok("a page may not write the outbox",
   /grant\s+(insert|update|delete|all)[^;]*on\s+public\.notify_outbox\b/i.test(CODE), false);
const sweep = (latest.get("notify_outbox_sweep") || {}).body || "";
ok("the sweep reads net._http_response", /net\._http_response/.test(sweep), true);
ok("the sweep gives up after ten tries", /max_tries\s+constant\s+integer\s*:=\s*10/.test(sweep), true);
ok("one sweep at a time", /pg_try_advisory_xact_lock/.test(sweep), true);
ok("the job is scheduled every minute",
   /cron\.schedule\('sjva-notify-outbox',\s*'\* \* \* \* \*'/.test(ALL), true);
ok("pg_cron failing to switch on stops the file",
   /create extension if not exists pg_cron[\s\S]{0,200}raise exception/.test(ALL), true);

console.log("\n  Each file shows its own check");

/* The editor shows the last statement's result and nothing else. From 094 on
   that is the check, and the stamp sits just before it. */
for (const f of FILES.filter((x) => Number(x.slice(0, 3)) >= 94)) {
  const body = code(TEXT.get(f)).trim();
  const stamp = body.search(/insert\s+into\s+public\.schema_migrations/i);
  const after = body.slice(body.indexOf(";", stamp) + 1).trim();
  const statements = after.split(/;\s*(?:\n|$)/).filter((s) => s.trim());
  ok(f + " ends on one check query, after its stamp",
     stamp > -1 && statements.length === 1 && /^(select|with)\b/i.test(statements[0].trim()), true);
}

console.log("\n  What rides on the same files");

const adv = (latest.get("advance_on_assessment") || {}).body || "";
ok("a pass moves on when the typing is checked afterwards",
   /new\.typing_verified_wpm is not distinct from old\.typing_verified_wpm/.test(adv) &&
   !/or old\.verdict = 'passed' then\s+return new/.test(adv), true, (latest.get("advance_on_assessment") || {}).file);
ok("and still only from assessment", /and status = 'assessment'/.test(adv), true);
ok("and never declines anybody", /'declined'/.test(adv), false);

const iv = (latest.get("notify_interview") || {}).body || "";
ok("her pick and her decline reach staff",
   /moment in \('picked', 'declined'\)[\s\S]{0,200}'event',\s*'arrived'/.test(iv), true);
ok("a declined set speaks once", /order by s\.starts_at, s\.id\s+limit 1/.test(iv), true);
ok("a placement move tells the assistant", /moment in \('offered', 'confirmed', 'moved'\)/.test(iv), true);
ok("a placement move tells the client", /moment in \('picked', 'declined', 'confirmed', 'moved'\)/.test(iv), true);
/* A decline is posted when declined_at changes, not on any update of a row
   that happens to be declined, so a later edit to it does not mail again. */
ok("a decline is heard when it happens, not on every later edit",
   /new\.declined_at is distinct from old\.declined_at/.test(iv), true);

/* The reason for moving or cancelling a placement interview rides on the
   post (sql/100), and api/notify.js quotes it to both people. The /admin box
   promises exactly that, so a post that dropped it would make the label lie. */
ok("placement posts carry the reason", /public\.post_interview_note_with_reason\(/.test(iv), true);
const withWhy = (latest.get("post_interview_note_with_reason") || {}).body || "";
ok("the reason poster sends through notify_send", /public\.notify_send\(/.test(withWhy), true,
   (latest.get("post_interview_note_with_reason") || {}).file);
ok("and adds 'reason' to the record", /jsonb_build_object\('reason'/.test(withWhy), true);
const resched = (latest.get("reschedule_placement_interview") || {}).body || "";
ok("a reschedule hands its reason to the trigger",
   /set_config\('sjva\.interview_reason'/.test(resched), true, (latest.get("reschedule_placement_interview") || {}).file);
const cancelPl = (latest.get("cancel_placement_interview") || {}).body || "";
ok("a cancellation posts with its reason", /public\.post_interview_note_with_reason\(/.test(cancelPl), true);

/* 109's fix-up: a placement called off before its first day, nothing logged. */
const endPl = (latest.get("end_placement") || {}).body || "";
ok("ending before the start returns 'ended before starting'", /'ended before starting'/.test(endPl), true,
   (latest.get("end_placement") || {}).file);
const endedMail = (latest.get("notify_placement_ended") || {}).body || "";
ok("and the client's email is told it never started", /'never_started'/.test(endedMail), true);
const skip = triggers.get("timesheets_placement_skips_unstarted");
ok("no new week is made for a placement that never started",
   !!skip && /before\s+insert\s+on\s+public\.timesheets/i.test(skip.def), true, skip ? skip.file : "missing");

/* 104: a duplicate name is refused with a hint the page reads, on update too. */
const upd = (latest.get("update_client") || {}).body || "";
ok("renaming a client onto another's name is refused with a hint",
   /hint = 'sjva-client-exists'/.test(upd), true, (latest.get("update_client") || {}).file);

/* 108: "today" is today in Central (as 109), never the server's UTC date,
   which turns over at 7 PM Central the evening before. */
const keep = (latest.get("keep_placement_on") || {}).body || "";
ok("keeping her on never reads the server's current_date", /current_date/i.test(code(keep)), false,
   (latest.get("keep_placement_on") || {}).file);

/* 097: the one-off catch-up lives in its own file now. An update of
   applications loose in 097 would move people every time 097 is re-run. */
const F097 = TEXT.get(FILES.find((f) => f.startsWith("097-"))) || "";
const outside097 = code(F097.replace(/\$fn\$[\s\S]*?\$fn\$/g, ""));
ok("097 updates no application outside its function", /update\s+public\.applications/i.test(outside097), false);

const sent = (latest.get("notify_assessment_sent") || {}).body || "";
ok("staff hear when the exams are sent, once", /old\.submitted_at is not null or new\.submitted_at is null/.test(sent), true);

const consent = (latest.get("application_says_yes_to_both") || {}).body || "";
ok("consent is refused with a hint the page reads", /hint = 'sjva-consent-needed'/.test(consent), true);
ok("the SQL editor is not refused", /auth\.jwt\(\) ->> 'role'/.test(consent), true);
ok("old queued rows drain for eight days after the page goes live",
   /min\(a\.privacy_consent_at\)/.test(consent) && /interval '8 days'/.test(consent), true);

for (const fn of ["create_client", "update_client", "resend_client_invite", "place_assistant",
                  "link_seat_request", "end_placement", "retry_notify"]) {
  const b = (latest.get(fn) || {}).body || "";
  ok(fn + " asks for applications.edit", /has_permission\('applications\.edit'\)/.test(b), true);
}
for (const fn of ["keep_placement_on", "reschedule_placement_interview", "cancel_placement_interview"]) {
  const b = (latest.get(fn) || {}).body || "";
  ok(fn + " is the client's or staff's, not hers",
     /is_placement_client\(/.test(b) && !/is_placement_assistant\(|owns_application\(/.test(b), true);
}

console.log("");
if (failed) {
  console.log("  " + failed + " failed");
  process.exit(1);
}
console.log("  Every email leaves one way, with one secret, and is tried again if it does not land. (" + highest + ")");
