/* The judgement scenarios, and the only place they exist.
 *
 * Twelve situations a virtual assistant actually meets, each with four things
 * she could do. One is right, one is defensible, two are wrong in ways that
 * cost a client money or trust. Scored 2 / 1 / 0 / 0 rather than right-wrong,
 * because "reasonable but not best" is a real answer and a binary mark throws
 * that information away.
 *
 * The options are shuffled per scenario and the page is sent POSITIONS, never
 * scores — the same rule tools/disc-items.mjs set and sql/025 enforces: the
 * browser is never told which word is a D. Here it is never told which option
 * is worth two. An assessment whose answer key ships in page source is not an
 * assessment, and view-source is one keystroke.
 *
 * Written to be plain. Everybody sitting this is working in their second
 * language, and a scenario they have to decode is a wrong answer about their
 * judgement rather than their English.
 *
 * THIS FILE IS JAVASCRIPT. It does not go in the Supabase SQL editor — pasting
 * it there fails at `export` on line 24, which is how you know. It is the
 * source the key in sql/045 is generated FROM; the file you paste is that one,
 * and only when the page that writes to it exists.
 *
 * `node tools/assessment-items.mjs` prints the key as SQL, for regenerating
 * 045 after changing a scenario. tools/check.mjs fails the build if the two
 * ever disagree.
 */

/* [prompt, [[option, points], ...]] — order here is the order the page shows,
   and it is already shuffled so no column is the answer. */
export const SCENARIOS = [
  ["A customer emails angry that they were charged twice. You can see only one charge in the system.",
    [["Apologise for the worry, say you can see one charge, and ask for the bank line showing the second.", 2],
     ["Tell them there is only one charge and close the ticket.", 0],
     ["Refund one charge straight away so they stop being angry.", 0],
     ["Forward it to your client and wait.", 1]]],

  ["Your client asks for a report by 5pm. At 3pm you realise the data you need is not available.",
    [["Send what you have at 5pm without mentioning the gap.", 0],
     ["Work late and send it at 9pm complete.", 1],
     ["Wait until 5pm, then explain why it is not coming.", 0],
     ["Tell them at 3pm what is missing, what you can deliver, and by when the rest can follow.", 2]]],

  ["A customer asks a question you do not know the answer to.",
    [["Give your best guess so you seem competent.", 0],
     ["Pass it to your client immediately without trying to find out.", 1],
     ["Say you will find out, give a time you will come back, and come back then.", 2],
     ["Tell them nobody can answer that.", 0]]],

  ["You notice a mistake you made last week that nobody has spotted.",
    [["Fix it quietly and say nothing.", 1],
     ["Tell your client what happened, what it affected, and what you have done about it.", 2],
     ["Leave it — it is done and nobody noticed.", 0],
     ["Mention it at your next monthly check-in.", 0]]],

  ["Your internet goes down thirty minutes before your shift.",
    [["Wait to see if it comes back before saying anything.", 0],
     ["Move to your backup connection and mention it afterwards.", 1],
     ["Say nothing and make the hours up later.", 0],
     ["Message your client as soon as you know, with when you expect to be back.", 2]]],

  ["A customer is rude to you in a chat.",
    [["Stay level, keep answering the actual question, and flag it to your client if it continues.", 2],
     ["Match their tone so they know it is not acceptable.", 0],
     ["Apologise repeatedly to calm them down.", 1],
     ["End the chat.", 0]]],

  ["Your client gives you an instruction that contradicts what they said yesterday.",
    [["Do the newest one, since it is the newest.", 1],
     ["Ask which one they want, quoting both, before doing either.", 2],
     ["Do yesterday's, since it was agreed first.", 0],
     ["Do both and let them pick.", 0]]],

  /* Two answers worth two here, and deliberately: checking first and redacting
     first are both right, and marking one of them wrong would teach the wrong
     lesson about handling other people's data. */
  ["You are asked to send a file that contains other customers' details.",
    [["Send it — your client asked for it.", 0],
     ["Refuse without explaining.", 0],
     ["Check who it is going to and why before sending anything with other people's details in it.", 2],
     ["Remove the other customers' rows and send the rest, saying what you removed.", 2]]],

  ["You finish your assigned work with two hours of your shift left.",
    [["Log off early and note the shorter day.", 0],
     ["Start on next week's tasks without asking.", 1],
     ["Tell your client you are free and ask what would help most.", 2],
     ["Find something plausible to look busy with.", 0]]],

  ["A customer asks for a discount you are not authorised to give.",
    [["Give it — it keeps the customer.", 0],
     ["Tell them no discounts are ever given.", 0],
     ["Ignore that part of the message and answer the rest.", 0],
     ["Say you cannot approve it yourself, that you will ask, and when you will reply.", 2]]],

  ["Two urgent tasks land at once and you cannot do both by the deadline.",
    [["Ask your client which comes first, saying what each will cost the other.", 2],
     ["Pick the one that looks harder and start.", 0],
     ["Do half of each.", 0],
     ["Do the one that arrived first.", 1]]],

  ["Your client has not replied to a question that is blocking you, and it is the end of the day.",
    [["Stop and wait — you are blocked.", 1],
     ["Say what you are blocked on, what you assumed to keep moving, and move on to other work.", 2],
     ["Guess and carry on without saying so.", 0],
     ["Message them repeatedly until they answer.", 0]]]
];

/* Which axes each track is scored on. A Customer Service applicant is not
   marked down for a bookkeeping score she was never asked to earn — the
   columns are recorded for everyone, but only these gate the stage. */
export const TRACK_AXES = {
  "Customer Service": ["english", "customer"],
  "Admin Tasks":      ["english", "data_entry"],
  "Sales & Marketing": ["english", "customer"]
};

export const PASS_MARK = 7;          /* out of 10, on each axis the track needs */
export const TYPING_TARGET_WPM = 40; /* the BPO floor; accuracy matters more */
export const TYPING_MIN_ACCURACY = 95;

/* ── the key, as SQL ──────────────────────────────────────────────────────
   Printed rather than exported into the page: this array is the thing that
   must never be reachable from a browser. */
function keySql() {
  const rows = SCENARIOS.map((s, i) =>
    "    (" + i + ", array[" + s[1].map((o) => o[1]).join(", ") + "])"
  ).join(",\n");
  return "  -- generated by tools/assessment-items.mjs — do not edit by hand\n" +
    "  for k in select * from (values\n" + rows +
    "\n  ) as t(q, pts) loop\n";
}

/* Run directly, not imported. argv[1] is undefined under `node -e`, which is
   how the checks import this file — guarding on it without the fallback threw
   there and took the whole import down with it. */
const RAN_DIRECTLY = (process.argv[1] || "").replace(/\\/g, "/").endsWith("assessment-items.mjs");

if (RAN_DIRECTLY) {
  console.log("scenarios: " + SCENARIOS.length);
  console.log("max scenario points: " + SCENARIOS.reduce((n, s) => n + Math.max(...s[1].map((o) => o[1])), 0));
  console.log("\nthe key, for the trigger:\n");
  console.log(keySql());
}
