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

/* ══════════════════════════════════════════════════════════════════════════
   ENGLISH — how comfortably she writes to a customer
   ══════════════════════════════════════════════════════════════════════════

   This exists because until now the English score WAS THE TYPING SPEED. Fast
   typing and good English are not the same thing and are barely related: a
   fast typist with weak English writes bad emails quickly. Every track is
   gated on english, so that one substitution decided the whole assessment for
   most applicants on a number about their fingers.

   Not a grammar exam. Each item is a line somebody would actually send, and
   the question is which version to send — so a person who speaks fluently but
   never learned the terminology scores what she deserves. The wrong options
   are wrong in the ways second-language writers are actually caught out:
   preposition after a verb, tense in a sentence about something just done,
   and the register slipping too casual or too stiff. */
export const ENGLISH = [
  ["You have just sent a customer their refund. Which line do you send?",
    [["Your refund has been sent and should reach your account within three working days.", 2],
     ["Your refund was sent and should reach to your account within three working days.", 0],
     ["We have send your refund, it will arrive in three working days.", 0],
     ["Your refund is sent, arriving to you within three working days.", 1]]],

  ["A customer asks when their order will arrive. It ships tomorrow. Which do you send?",
    [["It will be shipped since tomorrow and arrives on Friday.", 0],
     ["Your order leaves us tomorrow and should be with you on Friday.", 2],
     ["Your order is leaving tomorrow and will be with you since Friday.", 0],
     ["Your order ships tomorrow, arriving Friday.", 1]]],

  ["You need a customer to send a document before you can go further.",
    [["Send the document.", 0],
     ["I would be extremely grateful if you could possibly find the time to send the form.", 1],
     ["You must send the form or I cannot do anything.", 0],
     ["Could you send the signed form when you have a moment? I can finish this as soon as it arrives.", 2]]],

  ["A customer has complained about a delay that was your client's fault.",
    [["Sorry for the delay, it was not our fault but we apologise anyway.", 0],
     ["I am sorry this has taken so long. Here is where your order is now, and what happens next.", 2],
     ["Apologies for any inconvenience caused.", 1],
     ["The delay is happened because of a problem in the warehouse.", 0]]],

  ["Which of these says most clearly that you will follow up on Monday?",
    [["I will come back to you on Monday with an answer.", 2],
     ["I will be reverting back to you by Monday regarding this matter.", 0],
     ["I will try to update you sometime early next week hopefully.", 0],
     ["I will let you know on Monday.", 1]]],

  ["A customer asks for something your client does not offer.",
    [["We are not doing this.", 0],
     ["Unfortunately that is impossible for us.", 1],
     ["That is not something we offer, but here is what we can do instead.", 2],
     ["We cannot to do that, sorry.", 0]]],

  ["You are writing to a customer for the first time on your client's behalf.",
    [["Hey! Just checking in about your order :)", 0],
     ["To whom it may concern, I am writing in reference to the aforementioned order.", 0],
     ["Hi Sarah, I am writing from Rosehill about the order you placed last week.", 2],
     ["Dear Sarah, I hope this email finds you well. I am writing to you today about your order.", 1]]],

  ["Which sentence is correct?",
    [["The team have finished the report and they sent it yesterday.", 1],
     ["The team has finish the report and sent it yesterday.", 0],
     ["The team have finished the report and has sent it yesterday.", 0],
     ["The team has finished the report and sent it yesterday.", 2]]]
];

/* ══════════════════════════════════════════════════════════════════════════
   DETAIL — whether she notices the thing that is wrong
   ══════════════════════════════════════════════════════════════════════════

   Also scored from typing speed until now, under the name data_entry, which
   was the same mistake twice: speed at a keyboard says nothing about whether
   somebody spots that an invoice does not add up.

   Each item is a small record with exactly one thing wrong in it. The wrong
   options are all things that are ODD BUT FINE — a weekend delivery date, an
   unusual spelling — because the failure mode being tested for is somebody who
   flags everything as much as somebody who flags nothing. */
export const DETAIL = [
  ["An invoice reads: 3 x $40.00 = $120.00, 2 x $15.00 = $30.00, 1 x $22.50 = $22.50, total $182.50. What is wrong?",
    [["The total should be $172.50.", 2],
     ["Nothing is wrong.", 0],
     ["The second line should be $35.00.", 0],
     ["The third line cannot have a half dollar.", 0]]],

  ["A booking says: arrives Tuesday 14 March, departs Sunday 12 March, 3 nights. What is wrong?",
    [["Three nights is too short for that trip.", 0],
     ["The departure is before the arrival.", 2],
     ["March 14 is not a Tuesday.", 0],
     ["Nothing is wrong.", 0]]],

  ["A customer record reads: Maria Santos, maria.santos@rosehil.com, phone +63 917 555 0142, company Rosehill Plumbing. What should you check?",
    [["The phone number has too many digits.", 0],
     ["Nothing is wrong.", 0],
     ["The email domain is missing an l — rosehil, not rosehill.", 2],
     ["The country code does not match the company.", 0]]],

  ["A timesheet reads: Mon 8, Tue 8, Wed 8, Thu 8, Fri 8, total 42. What is wrong?",
    [["Friday should be 10.", 0],
     ["Nothing is wrong — 42 includes a break.", 0],
     ["The total should be 40.", 2],
     ["The week is missing the weekend.", 0]]],

  ["An order list has: #1041 Ana Reyes, #1042 Joy Delgado, #1042 Ana Reyes, #1043 Mark Cruz. What is wrong?",
    [["Ana Reyes should not have two orders.", 0],
     ["The numbers should be in order of name.", 0],
     ["Nothing is wrong.", 0],
     ["Two different orders share the number 1042.", 2]]],

  ["A meeting invite says: Thursday 10:00 AM Manila time, which is 9:00 PM Wednesday in Houston. What is wrong?",
    [["Manila is 13 hours ahead in March, so it is 9:00 PM Wednesday — this is correct.", 2],
     ["Houston should be Thursday, not Wednesday.", 0],
     ["10:00 AM is too early for a meeting.", 0],
     ["The invite is missing the meeting link.", 1]]],

  ["A quote reads: 40 hours a week at $7.75 an hour, $320.00 a week. What is wrong?",
    [["The hourly rate should be $8.00.", 0],
     ["Nothing is wrong.", 0],
     ["40 hours is too many for one week.", 0],
     ["40 x $7.75 is $310.00, not $320.00.", 2]]],

  ["A form has: Date of birth 03/14/1995, Age 31, filled in today in 2026. What is wrong?",
    [["The date format is ambiguous.", 1],
     ["Somebody born in March 1995 is 30 or 31 depending on the month — check today's date before flagging it.", 2],
     ["The age should be 30.", 0],
     ["March 14 1995 was not a valid date.", 0]]]
];

/* ══════════════════════════════════════════════════════════════════════════
   SALES — what she does with somebody who has not bought yet
   ══════════════════════════════════════════════════════════════════════════

   There was no sales measure at all. The Sales & Marketing track was gated on
   english and customer, so somebody was hired into a sales seat on the
   strength of how they handle a complaint.

   The line every item is drawn along: a good answer keeps the conversation
   alive and tells the truth. Two of the wrong answers are always the two ways
   people lose deals — pushing, and vanishing. */
export const SALES = [
  ["A lead replies to your quote with: \"That is more than we wanted to spend.\"",
    [["Offer a discount straight away to keep them.", 0],
     ["Ask what they were expecting and what the budget has to cover, before talking about price.", 2],
     ["Explain again why the price is fair.", 1],
     ["Tell them to come back when they have the budget.", 0]]],

  ["A lead was keen on a call, then went quiet for a week.",
    [["Send a short note with one useful thing and a question they can answer in a line.", 2],
     ["Call them repeatedly until they pick up.", 0],
     ["Mark them dead and move on.", 0],
     ["Send the same email again.", 1]]],

  ["A lead asks whether you do something your client does not offer.",
    [["Say yes and work out the details later.", 0],
     ["Say no and end the conversation.", 0],
     ["Say that is not something we do, ask what they were trying to solve, and see if the thing we do solves it.", 2],
     ["Avoid the question and keep selling what you have.", 0]]],

  ["A good lead says: \"This is right, but not until the new budget year in six months.\"",
    [["Agree a date to speak again, note what changes by then, and keep in light touch until it.", 2],
     ["Try to persuade them to start now.", 0],
     ["Close the lead — six months is too far out.", 0],
     ["Send them a monthly newsletter and hope.", 1]]],

  ["A lead says a competitor quoted them less.",
    [["Match the price.", 0],
     ["Say the competitor is not as good.", 0],
     ["Ask them to send you the competitor's quote.", 1],
     ["Ask what is included in their quote, and say plainly what is included in yours.", 2]]],

  ["A client you already work for mentions they are struggling to cover the afternoons.",
    [["Say nothing — you are not on the sales team today.", 0],
     ["Send them a price list.", 0],
     ["Tell them a second seat could cover the afternoons, and offer to have someone explain how it would work.", 2],
     ["Offer to work extra hours yourself.", 1]]],

  ["A lead offers to sign today for a bigger discount than you can give.",
    [["Give it — a signature today is worth it.", 0],
     ["Say you cannot approve that, say what you can do, and ask if that works.", 2],
     ["Say you will check and then never come back to them.", 0],
     ["Tell them the price is the price and leave it there.", 1]]],

  ["A lead wants something your client could technically do but would do badly.",
    [["Sell it — they asked for it.", 0],
     ["Say no without explaining.", 0],
     ["Sell it and warn them afterwards.", 0],
     ["Say it is not what we are best at, say what we are best at, and let them decide.", 2]]]
];

/* Which axes each track is scored on. A Customer Service applicant is not
   marked down for a bookkeeping score she was never asked to earn — the
   columns are recorded for everyone, but only these gate the stage.
   Sales & Marketing now carries a sales axis, which it could not before,
   because there was nothing to put in it. */
export const TRACK_AXES = {
  "Customer Service":  ["english", "customer"],
  "Admin Tasks":       ["english", "detail"],
  "Sales & Marketing": ["english", "sales", "customer"]
};

/* Every bank the page shows and the trigger scores, in one place, so adding a
   fifth is one line here rather than a hunt through three files. */
export const BANKS = {
  scenarios: SCENARIOS,
  english:   ENGLISH,
  detail:    DETAIL,
  sales:     SALES
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
