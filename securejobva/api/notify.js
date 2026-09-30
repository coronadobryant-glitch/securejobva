/* Tells you when something arrives.

   Five applications and two seat requests reached the database before this
   existed, and nobody was told about any of them. The only way to find out was
   to open /admin and look, which means the thing that decides how fast you
   reply is whether somebody happened to check.

   Supabase fires a Database Webhook on insert; this receives it and sends one
   email. It hangs off the row landing rather than the form submitting, so a
   lead that was parked on somebody's device by the queue in index.html and
   drained three days later still tells you when it finally arrives.

   Note what it does NOT need: the service role key. A webhook carries the whole
   row in its payload, so there is nothing to go back and read, and the most
   dangerous credential in the project stays out of a function that is reachable
   from the internet. */

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const RESEND = "https://api.resend.com/emails";

/* Which tables are worth an email, and how each one reads. Anything not listed
   is ignored rather than guessed at — a new table should be a decision here,
   not an automatic email nobody chose to receive. */
const KINDS = {
  applications: {
    subject: (r) => "New application — " + (list(r.tracks) || r.track || "no track given"),
    lines: (r) => [
      ["Name", r.name],
      ["Email", r.email],
      ["Phone", r.phone],
      ["Country", r.country],
      ["Region", r.region],
      ["Tracks", list(r.tracks) || r.track],
      ["Experience", r.experience],
      ["Shifts", list(r.shifts)],
      ["Connection", r.speed],
      ["Equipment", list(r.kit)],
      ["CV", r.cv],
      ["Note", r.note]
    ],
    where: "/admin"
  },
  seat_requests: {
    subject: (r) => "New seat request — " + (r.company || r.name || "no company given"),
    lines: (r) => [
      ["Name", r.name],
      ["Company", r.company],
      ["Email", r.email],
      ["Phone", r.phone],
      ["Seats", list(r.seats)],
      ["Hours a week", r.hours],
      ["Quoted", r.weekly ? "$" + r.weekly + " a week" : ""],
      ["Cover", list(r.blocks)],
      ["Time zone", r.timezone],
      ["Notes", r.notes]
    ],
    where: "/admin"
  },
  contact_messages: {
    subject: (r) => "Contact form — " + (r.reason || "no reason given"),
    lines: (r) => [
      ["Name", r.name],
      ["Email", r.email],
      ["Phone", r.phone],
      ["Reason", r.reason],
      ["Message", r.message]
    ],
    where: "/admin"
  }
};

function list(v) {
  return Array.isArray(v) ? v.filter(Boolean).join(", ") : (v || "");
}

/* ── the one the applicant gets ───────────────────────────────────────────
   careers.html closes with, in as many words:

     "We have it, and a confirmation is on its way to <their address>. A person
      reads every application and answers either way, usually within three
      working days."

   Until now nothing sent it. Applying for a job is exactly when somebody
   watches their inbox, and a promise made on the screen and not kept is worse
   than not making it.

   So this says precisely what that screen said and stops. It carries no
   decision, no stage, and no wording that could read as an offer — an
   applicant forwarding it to somebody should not be able to give the wrong
   impression of where they stand. Only applications get one: the seats and
   contact forms promise nothing, and inventing a message nobody was told to
   expect is a different decision from keeping this one.

   WHAT IT MAY REPEAT BACK, AND WHAT IT MAY NOT

   This is the one email in the file whose address and contents both come from
   a stranger. Anybody holding the publishable key can insert an application —
   that is what the form does — so anybody could put a victim's address in the
   email field and a sentence of their own in the track, and this used to mail
   the victim "We have your application for <their sentence>", signed by our
   domain. A phishing line with a link in it, delivered by us.

   So nothing typed goes back out verbatim. The track is named only when it is
   one of the three this site offers, spelled exactly as the form's checkboxes
   send it (091 now refuses anything else on insert; older rows may still hold
   it). The first name goes through firstName(), which only lets through
   something shaped like a name. Anything else falls back to wording that
   carries no input at all. */
const TRACKS = ["Customer Service", "Sales & Marketing", "Admin Tasks"];

function knownTracks(r) {
  const all = Array.isArray(r.tracks) ? r.tracks : (r.track ? [r.track] : []);
  const seen = [];
  for (const t of all) if (TRACKS.indexOf(t) !== -1 && seen.indexOf(t) === -1) seen.push(t);
  return seen.join(", ");
}

const CONFIRM = {
  applications: (r, site) => {
    const first = firstName(r.name);
    const what = knownTracks(r);

    const body = [
      "Hi " + first + ",",
      "",
      "We have your application" + (what ? " for " + what : "") + ".",
      "",
      "A person reads every one and answers either way, usually within three " +
        "working days. There is nothing else for you to do in the meantime.",
      "",
      "You can see where it has got to at " + site + "/status — sign in with " +
        "this address, and it will show you your own application and nothing else.",
      "",
      "If something in it needs correcting, reply to this email and tell us.",
      "",
      "SecureJobVA"
    ].join("\n");

    const html =
      '<div style="font:15px/1.65 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#26374F;max-width:34rem">' +
        "<p>Hi " + esc(first) + ",</p>" +
        "<p>We have your application" + (what ? " for <b>" + esc(what) + "</b>" : "") + ".</p>" +
        "<p>A person reads every one and answers either way, usually within three " +
          "working days. There is nothing else for you to do in the meantime.</p>" +
        '<p><a href="' + esc(site) + '/status" ' +
          'style="background:#0072EE;color:#fff;text-decoration:none;padding:10px 18px;' +
          'border-radius:6px;display:inline-block">See where it has got to</a></p>' +
        "<p>Sign in with this address and it will show you your own application " +
          "and nothing else.</p>" +
        "<p>If something in it needs correcting, reply to this email and tell us.</p>" +
        "<p>SecureJobVA</p>" +
      "</div>";

    return { subject: "We have your application — SecureJobVA", text: body, html };
  }
};

/* Quotes as well as brackets. Several callers put the result inside a
   double-quoted href, and escaping only & < > let a meeting link carrying a
   " close the attribute and add one of its own — a style that restyled part
   of an email we sign. A tag could never be closed, but an attribute is
   enough to make our mail say something we did not write. */
function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* A joining link, as the HTML part shows it.

   Only http and https become a link, and the address is put back together by
   the URL parser rather than passed through as typed, so what lands in the
   href is something a browser already agrees is one web address. 081 now
   refuses anything else on the way in; rows written before it are why this
   still checks. A value that fails is shown as text, which is still enough
   for somebody to copy, and is never clickable. */
function linkHtml(u) {
  const raw = String(u || "").trim();
  let href = "";
  try {
    const p = new URL(raw);
    if (p.protocol === "http:" || p.protocol === "https:") href = p.href;
  } catch (e) { href = ""; }
  return href
    ? '<a href="' + esc(href) + '">' + esc(raw) + "</a>"
    : esc(raw);
}

/* ── decisions, in both directions ────────────────────────────────────────
   Everything above hangs off a row landing from the public. This is the other
   direction: a week of hours sent, leave asked for, and the answers to both.
   Until this existed a week could be sent back with "Thursday looks like a
   double entry" and the only way to find out was to open /hub and notice.

   These arrive from the trigger in 031 rather than from a Supabase webhook,
   because a timesheet carries an application_id and no address — the person it
   is about is looked up in the database, where that is ordinary, and arrives
   here already attached. This endpoint still holds no database credential and
   still looks nothing up. */

const MONTH = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"];

/* Written out rather than handed to toLocaleDateString, which answers
   differently depending on the locale of whatever machine happens to run this
   and would make the wording of an email a property of the server. */
function dayText(iso) {
  const p = String(iso || "").split("-");
  const d = Number(p[2]), m = Number(p[1]);
  if (!d || !m) return String(iso || "");
  return d + " " + MONTH[m - 1];
}

function weekText(iso) {
  const p = String(iso || "").split("-").map(Number);
  if (p.length !== 3 || !p[2]) return String(iso || "");
  const end = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 6));
  const a = p[2], am = p[1];
  const b = end.getUTCDate(), bm = end.getUTCMonth() + 1;
  /* A week that stays in one month says the month once. */
  return am === bm
    ? a + " to " + b + " " + MONTH[bm - 1]
    : a + " " + MONTH[am - 1] + " to " + b + " " + MONTH[bm - 1];
}

function hoursText(n) {
  const v = Number(n || 0);
  return (Math.round(v * 100) / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/* The first word of a name, when it looks like one.

   Every greeting here starts "Hi <first word of what they typed>", and the
   name field is free text from a public form. A first word of
   "evil.example/verify" or "www.evil.example" would put a link in the first
   line of a message we sign, so only letters (any alphabet, with their
   accents), apostrophes and hyphens get through, at a length a name has.
   Anything else becomes "there", which is how these already greet somebody
   who left the name empty. */
function firstName(s) {
  const w = String(s || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}\p{M}'’-]{1,40}$/u.test(w) ? w : "there";
}

/* An interview time, for an email.

   Every other date in these messages is a plain date and means the same day to
   everybody. This one is a timestamptz and genuinely does not: 9:00 AM in
   Houston is 10:00 PM in Manila. The pages render it in whichever clock the
   reader has chosen, and an email cannot know that — so it names Central, in
   as many words, and lets them convert once rather than wonder for ever.

   Central by name rather than by offset, because the offset changes twice a
   year and nobody reading this email will be checking which side of March it
   is on. */
function slotText(r) {
  const d = new Date(r && r.starts_at);
  if (isNaN(d)) return "the time you agreed";
  let when;
  try {
    when = d.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      weekday: "long", day: "numeric", month: "long",
      hour: "numeric", minute: "2-digit"
    });
  } catch (e) {
    when = d.toUTCString();
  }
  const mins = Number(r.minutes || 0);
  return when + " Central" + (mins ? ", " + mins + " minutes" : "");
}

/* Anything that is not a plain yyyy-mm-dd comes back empty, and every caller
   leaves the date out of its sentence when it does. "paid on NaN undefined"
   in a receipt is worse than a receipt that does not say the day. */
function fullDate(iso) {
  const p = String(iso || "").split("-");
  if (p.length !== 3) return "";
  const d = Number(p[2]), m = Number(p[1]);
  if (!d || !m || m > 12 || !/^\d{4}$/.test(p[0])) return "";
  return d + " " + MONTH[m - 1] + " " + p[0];
}

/* A button and a closing line, since most of these end the same way. `where`
   may be null: a decline gets no button, because the only page to send someone
   to at that moment is the one advertising the job they did not get. */
function wrap(paras, site, where, label) {
  return '<div style="font:15px/1.65 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
      'color:#26374F;max-width:34rem">' +
    paras.join("") +
    (where
      ? '<p><a href="' + esc(site) + esc(where) + '" ' +
        'style="background:#0072EE;color:#fff;text-decoration:none;padding:10px 18px;' +
        'border-radius:6px;display:inline-block">' + esc(label) + "</a></p>"
      : "") +
    "<p>SecureJobVA</p>" +
  "</div>";
}

/* Every rung after the first, in the site's own words — the same sentences
   /status shows, so an email and the page never describe the same moment
   differently.

   028 sends the receipt and stops. These are the answer it promised. */
const STAGE_MAIL = {
  assessment: {
    subject: "Your application — the exams are next",
    lead: "has moved on to the exams and strengths test",
    body: "That is a written task in your track, the qualification exams, and " +
      "the strengths test. We will be in touch with the detail.",
    where: "/status", label: "See where you are"
  },
  /* This mail is sent by the STAGE CHANGE, and the stage can be moved before
     anybody has offered her a time — which is what happened the first time
     this ran. It used to say "Some times are waiting on your application page"
     over a button reading Pick your time, and she followed it to a page that
     had none. The mail cannot know whether slots exist, so it must not claim
     they do: it says what is true either way, and her page says which of the
     two she has arrived at. */
  interview: {
    subject: "Your application — interview next",
    lead: "has moved on to the interview",
    body: "One interview with us, on how you work and on your setup and " +
      "connection. We will offer you a few times to choose from — they appear " +
      "on your application page, and you will get an email the moment they do.",
    where: "/status", label: "Check your schedule"
  },
  approved: {
    subject: "You are through — paid training starts within a week",
    lead: "has been approved",
    body: "You are through. Paid training starts within a week, and we will be " +
      "in touch with the dates.",
    /* Its own paragraph, not a clause on the end of the good news. This is the
       email somebody reads before rearranging a week around training, and a
       condition on being paid is not a detail to bury. */
    note: "Training is paid only if you are hired at the end of it.",
    where: "/status", label: "See where you are"
  },
  hired: {
    subject: "You are on the team — your portal is open",
    lead: "is complete",
    body: "You are on the team. Your portal is open now: it is where your hours " +
      "go, where you ask for leave, and where you tell us how you would rather " +
      "be paid.",
    where: "/hub", label: "Open your portal"
  }
};

const DECIDE = {
  /* ── an interview being arranged ────────────────────────────────────────
     sql/057 and sql/058. Four moments, each addressed to the one person who
     now has to do something. None of them goes to staff: this is the one
     exchange in the product a client and an assistant settle between
     themselves, and mailing us every offered time would quietly undo that.

     There is no `arrived` half, which is what keeps that true — the branch in
     decision() that mails you and Bryant cannot be reached from here. */
  interview_slots: {
    /* Three sides now, not two. 057 built this for a client and an assistant
       settling a placement interview between themselves; 062 reused the table
       for an applicant's interview with us and wired no mail at all, so she
       was told nothing when times were offered and nothing when one was
       confirmed. The applicant branch goes to /status and never mentions a
       client, because on her interview there is not one. */
    offered: (r, p, site) => (r.side === "applicant" ? {
      subject: "Your interview — pick a time",
      text: [
        "Hi " + firstName(p.name) + ",", "",
        "We have put some times forward for your interview.",
        "", "Open " + site + "/status and choose whichever suits you. They are shown on your " +
        "own clock, with ours underneath.",
        "", "If none of them work, say so on that page and we will offer others. That is a " +
        "normal thing to do and it costs you nothing.",
        "", "SecureJobVA"].join("\n"),
      html: wrap([
        "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
        "<p>We have put some times forward for your interview.</p>",
        "<p>They are shown on your own clock, with ours underneath. If none of them work, say " +
        "so on that page and we will offer others &mdash; that is a normal thing to do and it " +
        "costs you nothing.</p>"
      ], site, "/status", "Check your schedule")
    } : {
      subject: r.other + " have suggested interview times",
      text: [
        "Hi " + firstName(p.name) + ",", "",
        r.other + " want to meet you and have suggested some times.",
        "", "Open " + site + "/hub and pick the one that works. They are shown on your own " +
        "clock, with the client's underneath.",
        "", "If none of them work, say so on that page and they will offer others. That is a " +
        "normal thing to do.",
        "", "SecureJobVA"].join("\n"),
      html: wrap([
        "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
        "<p><b>" + esc(r.other) + "</b> want to meet you and have suggested some times.</p>",
        "<p>They are shown on your own clock, with the client&rsquo;s underneath. If none of " +
        "them work, say so on that page and they will offer others &mdash; that is a normal " +
        "thing to do.</p>"
      ], site, "/hub", "Pick a time")
    }),


    /* The joining details, arriving after the confirmation that promised them.
       Applicant only: on a placement the client types the link while
       confirming, so the confirmation carried it and a second mail saying the
       same thing is how people stop reading the first. */
    link: (r, p, site) => ({
      subject: "Where to join your interview — " + slotText(r),
      text: [
        "Hi " + firstName(p.name) + ",", "",
        "Here is where to join your interview on " + slotText(r) + ".",
        "", "Link: " + (r.meeting_url || ""),
        "", "That time is in Central. Open " + site + "/status to see it on your own clock.",
        "", "Join a couple of minutes early so any camera or microphone trouble is not the " +
        "first thing that happens. If the link does not work, reply to this email.",
        "", "SecureJobVA"].join("\n"),
      html: wrap([
        "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
        "<p>Here is where to join your interview on <b>" + esc(slotText(r)) + "</b>.</p>",
        "<p>" + linkHtml(r.meeting_url) + "</p>",
        "<p>That time is in Central &mdash; your page shows it on your own clock. Join a couple " +
        "of minutes early so any camera or microphone trouble is not the first thing that " +
        "happens. If the link does not work, reply to this email.</p>"
      ], site, "/status", "See your interview")
    }),

    /* Calling one off. Applicant only: on a placement the two parties settle
       it between themselves and there is no equivalent moment.

       It is the one message in this flow that is bad news, so it says the one
       useful thing straight away — new times are coming, she does not have to
       do anything — rather than leading with an apology and making her read
       to the end to find out whether she has lost the job. She has not. */
    /* The time moved on an interview she has already been told is happening.

       It leads with the new time and the word still, because the subject line
       alone will make her think it is off. That is the whole difference
       between this message and the one below it, and getting it wrong costs
       somebody an afternoon of thinking she has been dropped.

       The link rides along: a move that also changed the room is one piece of
       news, and 058 already refuses to send the same fact twice. */
    moved: (r, p, site) => ({
      subject: "Your interview has moved to " + slotText(r),
      text: [
        "Hi " + firstName(p.name) + ",", "",
        "Your interview is still going ahead — we have had to move it, and it is now " +
        slotText(r) + ".",
        "", "That time is in Central. Open " + site + "/status to see it on your own clock.",
        "", (r.meeting_url ? "Where to join: " + r.meeting_url : ""),
        "", "Nothing is needed from you. If that new time does not work, reply to this " +
        "email and we will find another.",
        "", "SecureJobVA"].join("\n"),
      html: wrap([
        "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
        "<p><b>Your interview is still going ahead.</b> We have had to move it, and it is " +
        "now <b>" + esc(slotText(r)) + "</b>.</p>",
        (r.meeting_url
          ? "<p>Where to join: " + linkHtml(r.meeting_url) + "</p>"
          : ""),
        "<p>That time is in Central &mdash; your page shows it on your own clock. Nothing is " +
        "needed from you. If the new time does not work, reply to this email and we will " +
        "find another.</p>"
      ], site, "/status", "See your interview")
    }),

    cancelled: (r, p, site) => ({
      subject: "Your interview on " + slotText(r) + " is cancelled",
      text: [
        "Hi " + firstName(p.name) + ",", "",
        "We have had to cancel your interview on " + slotText(r) + ". Sorry for the change.",
        "", "This is not a decision about your application — we will send new times shortly " +
        "and you pick whichever suits you. There is nothing for you to do until then.",
        "", "If that link was in your calendar, it will not work now.",
        "", "SecureJobVA"].join("\n"),
      html: wrap([
        "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
        "<p>We have had to cancel your interview on <b>" + esc(slotText(r)) +
        "</b>. Sorry for the change.</p>",
        "<p><b>This is not a decision about your application.</b> We will send new times " +
        "shortly and you pick whichever suits you — there is nothing for you to do " +
        "until then.</p>",
        "<p>If that link was in your calendar, it will not work now.</p>"
      ], site, "/status", "See your application")
    }),

    picked: (r, p, site) => ({
      subject: r.other + " picked an interview time",
      text: [
        "Hi " + firstName(p.name) + ",", "",
        r.other + " has picked " + slotText(r) + ".",
        "", "Confirm it at " + site + "/seats and we will tell her it is on. You can add a " +
        "meeting link at the same time.",
        "", "SecureJobVA"].join("\n"),
      html: wrap([
        "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
        "<p><b>" + esc(r.other) + "</b> has picked <b>" + esc(slotText(r)) + "</b>.</p>",
        "<p>Confirm it and we will tell her it is on. You can add a meeting link at the same " +
        "time; leave it empty and she gets the email address on your account instead.</p>"
      ], site, "/seats", "Confirm the time")
    }),

    declined: (r, p, site) => ({
      subject: r.other + " could not make any of those times",
      text: [
        "Hi " + firstName(p.name) + ",", "",
        r.other + " could not make any of the times you offered.",
        "", "Offer a few others at " + site + "/seats and she will pick one. She is on American " +
        "hours, so your morning is usually her evening.",
        "", "SecureJobVA"].join("\n"),
      html: wrap([
        "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
        "<p><b>" + esc(r.other) + "</b> could not make any of the times you offered.</p>",
        "<p>Offer a few others and she will pick one. She is on American hours, so your " +
        "morning is usually her evening.</p>"
      ], site, "/seats", "Offer other times")
    }),

    /* The only one that goes to two people, posted twice by 058 rather than
       sent once to a list — they are told different things. `side` is which
       of them this copy is for. */
    confirmed: (r, p, site) => {
      /* Hers is the one confirmation that is not between two other people, so
         it names no client and points at her own page. It is also the mail
         somebody actually asked for: choosing the time in /admin now tells
         her, which until 066 it did not. */
      if (r.side === "applicant") {
        const link = r.meeting_url
          ? "Where: " + r.meeting_url
          : "We will send the joining details to this address before the day.";
        return {
          subject: "Your interview is set — " + slotText(r),
          text: [
            "Hi " + firstName(p.name) + ",", "",
            "Your interview with SecureJobVA is confirmed for " + slotText(r) + ".",
            "", link,
            "", "That time is in Central. Open " + site + "/status to see it on your own clock.",
            "", "Camera on, somewhere quiet. If you need to move it, reply to this email.",
            "", "SecureJobVA"].join("\n"),
          html: wrap([
            "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
            "<p>Your interview with <b>SecureJobVA</b> is confirmed for <b>" +
              esc(slotText(r)) + "</b>.</p>",
            "<p>" + (r.meeting_url
              ? "Where: " + linkHtml(r.meeting_url)
              : esc(link)) + "</p>",
            "<p>That time is in Central &mdash; your page shows it on your own clock. Camera " +
            "on, somewhere quiet. If you need to move it, reply to this email.</p>"
          ], site, "/status", "See your interview")
        };
      }
      const mine = r.side === "assistant";
      const where = mine ? "/hub" : "/seats";
      const link = r.meeting_url
        ? "Where: " + r.meeting_url
        : mine
          ? "They will write to you at the address on your application."
          : "She will write to you at the address on this account.";
      return {
        subject: "Your interview is set — " + slotText(r),
        text: [
          "Hi " + firstName(p.name) + ",", "",
          "Your interview with " + r.other + " is confirmed for " + slotText(r) + ".",
          "", link,
          "", (mine
            ? "That time is in Central, which is the client's clock. Open " + site +
              "/hub to see it on yours."
            : "She has been told, and sees the time on her own clock."),
          "", "SecureJobVA"].join("\n"),
        html: wrap([
          "<p>" + esc("Hi " + firstName(p.name) + ",") + "</p>",
          "<p>Your interview with <b>" + esc(r.other) + "</b> is confirmed for <b>" +
            esc(slotText(r)) + "</b>.</p>",
          "<p>" + (r.meeting_url
            ? "Where: " + linkHtml(r.meeting_url)
            : esc(link)) + "</p>",
          "<p>" + esc(mine
            ? "That time is in Central, which is the client's clock. Open your portal to see " +
              "it on yours."
            : "She has been told, and sees the time on her own clock.") + "</p>"
        ], site, where, mine ? "See your interview" : "See the details")
      };
    }
  },

  applications: {
    decided: (r, p, site) => {
      const hi = "Hi " + firstName(p.name || r.name) + ",";

      /* The one that had to be written carefully. Somebody has waited weeks for
         it, and the two things it owes them are a plain answer and a date they
         can act on — not an apology, and not a door left ambiguously ajar. */
      if (r.status === "declined") {
        const again = fullDate(r.again);
        const when = again
          ? "You are welcome to apply again from " + again + "."
          : "You are welcome to apply again in three months.";
        return {
          subject: "About your application",
          text: [hi, "",
            "We are not taking your application forward this time. A person read " +
              "it, and we said we would answer either way.",
            "", when, "", "SecureJobVA"].join("\n"),
          html: wrap([
            "<p>" + esc(hi) + "</p>",
            "<p>We are not taking your application forward this time. A person " +
              "read it, and we said we would answer either way.</p>",
            "<p>" + esc(when) + "</p>"
          ], site, null, null)
        };
      }

      const s = STAGE_MAIL[r.status];
      if (!s) return null;
      return {
        subject: s.subject,
        text: [hi, "",
          "Your application " + s.lead + ".",
          "", s.body,
          ...(s.note ? ["", s.note] : []),
          "", "You can see where you are at " + site + s.where + ".",
          "", "SecureJobVA"].join("\n"),
        html: wrap([
          "<p>" + esc(hi) + "</p>",
          "<p>Your application <b>" + esc(s.lead) + "</b>.</p>",
          "<p>" + esc(s.body) + "</p>",
          s.note
            ? '<p style="border-left:3px solid #FFC233;background:#FFF6E0;margin:0 0 16px;' +
              'padding:10px 14px;color:#001232">' + esc(s.note) + "</p>"
            : ""
        ], site, s.where, s.label)
      };
    }
  },

  /* ── being placed ───────────────────────────────────────────────────────
     Three moments, and they are three different messages. The first exists to
     stop the silence while a meeting is arranged; the second is the one with
     dates in it; the third is the one she has been waiting for. */
  placements: {
    decided: (r, p, site) => {
      const hi = "Hi " + firstName(p.name) + ",";
      const client = r.client || "one of our clients";
      const hours = r.hours_per_week || 40;

      if (r.status === "matched") {
        return {
          subject: "We have found you a client",
          text: [hi, "",
            "We have matched you with " + client + ", one of our clients. The next " +
              "step is a meeting with them, and we will be in touch to arrange it.",
            "", "Nothing is settled until after that meeting — we will tell you either way.",
            "", "SecureJobVA"].join("\n"),
          html: wrap([
            "<p>" + esc(hi) + "</p>",
            "<p>We have matched you with <b>" + esc(client) + "</b>, one of our clients. " +
              "The next step is a meeting with them, and we will be in touch to arrange it.</p>",
            "<p>Nothing is settled until after that meeting &mdash; we will tell you " +
              "either way.</p>"
          ], site, "/hub", "See your portal")
        };
      }

      if (r.status === "trial") {
        const day = r.started_on ? dayText(r.started_on) : null;
        const trial = r.trial_weeks
          ? "It begins as a " + r.trial_weeks + "-week trial. If they want you to stay " +
            "after that, it simply carries on and we will tell you."
          : "We will let you know as soon as they confirm.";
        /* The sentence that matters most in the whole set. Being started by a
           client is exactly the moment somebody could think they have been
           handed over to a different employer. */
        const stays = "You stay on the SecureJobVA team throughout, and we pay you as we " +
          "always have. Nothing about that changes.";
        return {
          subject: day ? "You start with " + client + " on " + day
                       : "You are starting with " + client,
          text: [hi, "",
            client + " would like you to start." +
              (day ? " Your first day is " + day + ", at " + hours + " hours a week." : ""),
            "", trial, "", stays,
            "", "You can see it at " + site + "/hub.", "", "SecureJobVA"].join("\n"),
          html: wrap([
            "<p>" + esc(hi) + "</p>",
            "<p><b>" + esc(client) + "</b> would like you to start." +
              (day ? " Your first day is <b>" + esc(day) + "</b>, at <b>" + esc(hours) +
                " hours a week</b>." : "") + "</p>",
            "<p>" + esc(trial) + "</p>",
            "<p>" + esc(stays) + "</p>"
          ], site, "/hub", "See your portal")
        };
      }

      /* Anything else — an ended placement above all — has no message here.
         035 already declines to post for it, but the trigger and this file are
         two lists in two places and only one of them can be right when they
         disagree. Falling through to the branch below would have told somebody
         they were staying on at the moment their placement ended. */
      if (r.status !== "ongoing") return null;

      /* Kept on. Short on purpose — the news is the whole message. */
      return {
        subject: "You are staying on with " + client,
        text: [hi, "",
          client + " would like to keep you on, so your placement simply carries on. " +
            "Nothing changes and there is nothing you need to do.",
          "", "SecureJobVA"].join("\n"),
        html: wrap([
          "<p>" + esc(hi) + "</p>",
          "<p><b>" + esc(client) + "</b> would like to keep you on, so your placement " +
            "simply carries on. Nothing changes and there is nothing you need to do.</p>"
        ], site, "/hub", "See your portal")
      };
    }
  },

  timesheets: {
    /* To you and Bryant. The days are printed because a wrong number is the
       whole reason the queue exists, and it is only visible if the days are. */
    arrived: (r, p) => ({
      subject: "Timesheet sent — " + (p.name || "an assistant") +
        ", week of " + dayText(r.week_starts_on),
      lines: [
        ["Assistant", p.name],
        ["Week", weekText(r.week_starts_on)],
        ["Total", hoursText(r.hours) + " hours"],
        ["Days", r.days]
      ],
      where: "/admin"
    }),

    decided: (r, p, site) => {
      const week = weekText(r.week_starts_on);
      const hi = "Hi " + firstName(p.name) + ",";

      if (r.status === "approved") {
        return {
          subject: "Your hours for " + week + " are approved",
          text: [hi, "",
            "Your timesheet for " + week + " has been approved — " +
              hoursText(r.hours) + " hours. Nothing else is needed from you for that week.",
            "", "You can see it at " + site + "/hub.", "", "SecureJobVA"].join("\n"),
          html: wrap([
            "<p>" + esc(hi) + "</p>",
            "<p>Your timesheet for <b>" + esc(week) + "</b> has been approved — <b>" +
              esc(hoursText(r.hours)) + " hours</b>. Nothing else is needed from you " +
              "for that week.</p>"
          ], site, "/hub", "See your hours")
        };
      }

      /* The one that actually had to exist. The reason is the message — an
         email saying a week came back without saying why is the same silence
         in a longer form. */
      const why = String(r.note || "").trim();
      return {
        subject: "Your hours for " + week + " need a change",
        text: [hi, "",
          "Your timesheet for " + week + " has come back to you" +
            (why ? " with a note:" : "."), "",
          why ? "  " + why : "",
          why ? "" : "",
          "Change what needs changing and send it again. It stays open for " +
            "editing until you do.",
          "", "Open it at " + site + "/hub.", "", "SecureJobVA"]
          .filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
        html: wrap([
          "<p>" + esc(hi) + "</p>",
          "<p>Your timesheet for <b>" + esc(week) + "</b> has come back to you" +
            (why ? " with a note:" : ".") + "</p>",
          why ? '<p style="border-left:3px solid #FFC233;background:#FFF6E0;margin:0 0 16px;' +
                'padding:10px 14px;color:#001232">' + esc(why) + "</p>" : "",
          "<p>Change what needs changing and send it again. It stays open for " +
            "editing until you do.</p>"
        ], site, "/hub", "Open your timesheet")
      };
    }
  },

  /* ── a client wants somebody different ──────────────────────────────────
     To you and Bryant, and there is deliberately no `decided` half. The
     assistant is not told and must never be: 032 keeps her out of the table
     and this keeps her out of the mail. Somebody tells her in their own words
     once it is known what is actually happening. */
  swap_requests: {
    arrived: (r) => ({
      subject: "Replacement asked for — " + (r.client || "a client") +
        " on " + (r.assistant || "an assistant"),
      lines: [
        ["Client", r.client],
        ["Assistant", r.assistant],
        ["With them since", r.since ? dayText(r.since) : ""],
        ["Their reason", r.reason]
      ],
      where: "/admin"
    })
  },

  leave_requests: {
    arrived: (r, p) => ({
      subject: "Leave requested — " + (p.name || "an assistant") + ", " +
        dayText(r.starts_on) + " to " + dayText(r.ends_on),
      lines: [
        ["Assistant", p.name],
        ["From", dayText(r.starts_on)],
        ["To", dayText(r.ends_on)],
        ["Reason", r.reason]
      ],
      where: "/admin"
    }),

    decided: (r, p, site) => {
      const span = dayText(r.starts_on) + " to " + dayText(r.ends_on);
      const hi = "Hi " + firstName(p.name) + ",";
      const yes = r.status === "approved";
      return {
        subject: yes ? "Your leave for " + span + " is approved"
                     : "Your leave for " + span + " was not approved",
        text: [hi, "",
          yes ? "Your leave for " + span + " has been approved."
              : "Your leave for " + span + " has not been approved this time. " +
                "If the dates could work differently, ask again or reply to this email.",
          "", "You can see it at " + site + "/hub.", "", "SecureJobVA"].join("\n"),
        html: wrap([
          "<p>" + esc(hi) + "</p>",
          "<p>Your leave for <b>" + esc(span) + "</b> " +
            (yes ? "has been <b>approved</b>."
                 : "has <b>not been approved</b> this time. If the dates could work " +
                   "differently, ask again or reply to this email.") + "</p>"
        ], site, "/hub", "See your leave")
      };
    }
  },

  /* ── a payment, recorded ────────────────────────────────────────────────
     sql/093. Money comes in by bank transfer, Wise, PayPal and the rest, and
     /pay records it after the fact — nothing here takes a card. Until this, a
     client who paid heard nothing back unless they opened /pay and looked for
     the line, which is not what anybody expects after sending money.

     So this says what was recorded and where the statement is, and nothing
     more: no due date, no balance, no promise about refunds. The balance
     depends on weeks this payload does not carry, and a receipt that guessed
     at it would be the one email a client keeps and quotes back. It goes to
     the contact on the client's record and to nobody else, once. */
  client_payments: {
    recorded: (r, p, site) => {
      const hi = "Hi " + firstName(p.name) + ",";
      const amount = money(r.amount_cents);
      const on = fullDate(r.paid_on);
      const how = PAY_METHOD[r.method] || "";
      const ref = String(r.reference || "").trim();
      const from = String(r.business || "").trim();
      const line = "We have recorded a payment" + (from ? " from " + from : "") +
        " of " + amount + (on ? ", paid on " + on : "") + (how ? " by " + how : "") +
        (ref ? ", reference " + ref : "") + ".";
      return {
        subject: "Payment received — " + amount,
        text: [hi, "", line, "",
          "Your statement is at " + site + "/pay.", "", "SecureJobVA"].join("\n"),
        html: wrap([
          "<p>" + esc(hi) + "</p>",
          "<p>" + esc(line) + "</p>"
        ], site, "/pay", "See your statement")
      };
    }
  }
};

/* The method as a person would say it. The keys are the values /pay stores;
   one not listed here is left out of the sentence rather than printed raw.
   "other" is left out on purpose too: "paid by other" says nothing, and a
   receipt that reads oddly is one that gets questioned. */
const PAY_METHOD = {
  bank_transfer: "bank transfer", wise: "Wise", paypal: "PayPal",
  card: "card", cheque: "cheque", cash: "cash"
};

/* Cents to dollars, with thousands grouped by hand — toLocaleString would
   make the figure in a receipt depend on the machine that happens to run it,
   the same reason dayText() spells out its months. */
function money(cents) {
  const c = Math.round(Number(cents || 0));
  const neg = c < 0;
  const abs = Math.abs(c);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const part = String(abs % 100).padStart(2, "0");
  return (neg ? "-" : "") + "$" + whole + "." + part;
}

/* Plain text alongside the HTML. A notification that arrives unreadable on a
   phone with images off is a notification that gets ignored. */
function render(kind, row, site) {
  const rows = kind.lines(row).filter(([, v]) => v !== null && v !== undefined && v !== "");

  const text = rows.map(([k, v]) => k + ": " + v).join("\n") +
    "\n\nOpen it: " + site + kind.where;

  const html =
    '<div style="font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#26374F">' +
      '<table style="border-collapse:collapse">' +
        rows.map(([k, v]) =>
          '<tr>' +
            '<td style="padding:4px 16px 4px 0;color:#5C6E88;vertical-align:top;white-space:nowrap">' +
              esc(k) + "</td>" +
            '<td style="padding:4px 0;color:#001232">' + esc(v) + "</td>" +
          "</tr>").join("") +
      "</table>" +
      '<p style="margin:20px 0 0">' +
        '<a href="' + esc(site) + esc(kind.where) + '" ' +
        'style="background:#0072EE;color:#fff;text-decoration:none;padding:10px 18px;' +
        'border-radius:6px;display:inline-block">Open in the portal</a></p>' +
    "</div>";

  return { text, html };
}

/* ── getting it to Resend ─────────────────────────────────────────────────
   NOTHING OUTSIDE THIS FILE RETRIES A SEND.

   This file used to say that answering 502 told Supabase to retry, and built
   its rules around a retry loop: the staff alert "must be retried until it
   lands", the applicant's copy must never decide the status code or it would
   mail you the same application forever. None of that loop exists. Every
   caller is a pg_net call from a trigger — supabase_functions.http_request in
   021 and 028, net.http_post in 031, 040, 058 and 093 — and pg_net fires once,
   writes whatever came back into net._http_response, and moves on. A 502 from
   here was never a request for another try. It was the email, lost.

   So the one retry there is happens here, inside this request:

     - A refusal that looks like the reply_to address (400 or 422 while one
       was set) goes again once without it. The reply address is typed by
       whoever filled in the form, and a typo in it must not cost the staff
       alert — staff lose a reply button, not the message.
     - A refusal that looks temporary (Resend down, rate-limited, the network
       gone: 5xx, 429 or no answer at all) goes again once after a short
       pause. Enough for a blip. An outage longer than a second is not fixed
       here, and nothing pretends it is.

   And a send that still fails is made visible rather than retried: it is
   logged to the function log with the table, the event and the row id —
   enough to find the row in /admin and act on it by hand — and the staff
   alert's failure still answers 502, which is what lands in
   net._http_response for anybody who looks there. No address goes into the
   log: the row id finds the person, and a log is not where their email
   should live.

   A real queue — an outbox table and a scheduled job that re-sends what is
   still unsent — is the fix that makes an outage survivable. It needs a
   table, a cron and every notify trigger rewritten, so it is not in this
   file, and this comment is here so nobody assumes it already exists. */

/* The same rule 073 holds applications and seat requests to, and 092 holds
   contact messages to: something, an @, something, a dot, two or more. An
   address that fails it is not sent to and is not offered as a reply_to. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function address(v) {
  const s = String(v || "").trim();
  return EMAIL.test(s) ? s : "";
}

const PAUSE_MS = 800;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

/* Resend's refusals sometimes quote the address they refused. The log keeps
   the reason and loses the address. */
function redact(s) {
  return String(s || "").replace(/[^\s@"'<>,;:]+@[^\s@"'<>,;:]+/g, "<address>").slice(0, 300);
}

async function attempt(env, msg, key) {
  try {
    const r = await fetch(RESEND, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.key,
        "Content-Type": "application/json",
        "Idempotency-Key": key
      },
      body: JSON.stringify(Object.assign({ from: "SecureJobVA <" + env.from + ">" }, msg))
    });
    if (r.ok) return { ok: true, status: r.status };
    const detail = await r.text().catch(() => "");
    return { ok: false, status: r.status, detail: detail };
  } catch (e) {
    return { ok: false, status: 0, detail: String(e && e.message ? e.message : e) };
  }
}

/* The name Resend is given for one email, so that sending it twice sends it
   once.

   The pause-and-retry below goes again after no answer, a 429 or a 5xx, and
   none of those proves the first try was turned away. A connection that
   drops after Resend took the message looks exactly like one that dropped
   before; so does a 502 from something in between. Without a key the retry
   would be a second copy of the same email, and for a receipt that is the
   worst thing it could be — 093 says why: a second receipt for the same
   money is how a client comes to believe they paid twice. With one, Resend
   answers the second request with the first one's result and sends nothing.

   The key is made fresh for every call to send(), not built from the row
   alone. The only repeats this is meant to catch happen inside this one
   request — pg_net never asks twice (see the note above) — and a key made
   of the table, the event and the row id would also swallow a real second
   email: an application moved to interview, back, and to interview again
   inside the 24 hours Resend remembers a key would tell her once. The
   table, event, row and who it is for go in front anyway, so a key seen in
   Resend's log says what it was for. Never the address, for the same reason
   the log line below leaves it out.

   Resend refuses a key it has seen with a different body (409), so the send
   without reply_to below is a different email and gets a key of its own.
   A 409 because the first try is still being worked on when the retry
   arrives comes back as a failure and is logged as one — with its status,
   so whoever reads the log knows that one may in fact have gone. */
function sendKey(what) {
  const w = what || {};
  return [w.table, w.event, w.id, w.to, randomUUID()]
    .map((v) => String(v == null ? "-" : v).replace(/[^\w.-]/g, "_").slice(0, 40))
    .join(":");
}

/* One place that talks to Resend, so the from address, the auth header and
   the retry rules above are written once. `what` names the send for the log
   if it fails. Returns the outcome; the caller decides what it means. */
async function send(env, msg, what) {
  let m = msg;
  let key = sendKey(what);
  let r = await attempt(env, m, key);

  if (!r.ok && m.reply_to && (r.status === 400 || r.status === 422)) {
    m = Object.assign({}, m);
    delete m.reply_to;
    key = key + ":noreply";
    r = await attempt(env, m, key);
  }

  /* The same key as the try it repeats: if that one went through, Resend
     drops this one. */
  if (!r.ok && (r.status === 0 || r.status === 429 || r.status >= 500)) {
    await wait(PAUSE_MS);
    r = await attempt(env, m, key);
  }

  if (!r.ok) {
    console.error("[notify] NOT DELIVERED " + JSON.stringify(Object.assign({}, what, {
      status: r.status, detail: redact(r.detail)
    })));
  }
  return r;
}

/* The shared secret, compared in constant time.

   `!==` on two strings stops at the first character that differs, so how
   long a wrong guess takes to be refused says how much of it was right.
   Over the internet that is a faint signal, but it costs one line to remove.
   Both sides are hashed first because timingSafeEqual refuses buffers of
   different lengths, and refusing early on length would leak the length. */
function sameSecret(given, expected) {
  const a = createHash("sha256").update(String(given || "")).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

/* The staff addresses, or a refusal naming what is missing. Asked for only on
   the paths that mail staff: an applicant's stage change, an assistant's
   approved week or a client's receipt never uses NOTIFY_TO, and used to be
   refused along with everything else the moment it went missing. */
function staffOr500(env, res) {
  if (env.to.length) return true;
  res.status(500).json({ error: "NOTIFY_TO is not set" });
  return false;
}

/* A decision, and which way it is going is the whole difference.

   `arrived` goes to you and Bryant. Its failure answers 502, the one status
   code in this file that means an email was lost — see the note on send()
   for what does and does not happen next.

   Everything else goes to the one person it is about, and its outcome is
   reported in the body of a 200. A dead address there is that person's
   missing email, not a fault in the endpoint, and folding it into the status
   code would make a real outage harder to see among them. */
async function decision(body, res, env) {
  const shapes = DECIDE[body.table];
  const shape = shapes && shapes[body.event];
  const person = body.person || {};
  const record = body.record || {};
  const what = { table: String(body.table), event: String(body.event), id: record.id || null };

  /* A status nobody asked to hear about is ignored quietly, with a 200, so
     net._http_response does not fill with errors that are not errors. */
  if (!shape) {
    return res.status(200).json({ skipped: String(body.table) + "/" + String(body.event) });
  }

  /* Her picking a time, or declining every one, tells nobody by mail. On a
     placement those two moments go to the client, who is waiting on somebody
     else; on her interview the other party is us, and /admin already shows her
     pick as a Confirm button on the row in front of the person who acts on it.
     Mailing ourselves about our own queue is how a queue stops being read.

     066 does not post these, so this is the second lock rather than the first
     — and it is the one that holds if anybody ever posts the payload by hand. */
  if (body.table === "interview_slots" && record.side === "applicant" &&
      (body.event === "picked" || body.event === "declined")) {
    return res.status(200).json({ skipped: "interview_slots/" + body.event + " (applicant)" });
  }

  /* The joining link on its own is applicant-only, as the template says: on a
     placement the client types the link while confirming, so the assistant's
     confirmation already carried it, and 067 posts `link` for the applicant
     side alone. The template also points at /status, which is not an
     assistant's page. This is the second lock on that, for the same reason
     as the one above. */
  if (body.table === "interview_slots" && body.event === "link" && record.side !== "applicant") {
    return res.status(200).json({ skipped: "interview_slots/link (" + String(record.side) + ")" });
  }

  if (body.event === "arrived") {
    if (!staffOr500(env, res)) return;
    const m = shape(record, person, env.site);
    /* Rendered through the same function the other three notifications use, so
       there is one table style and not a second one drifting away from it. */
    const { text, html } = render({ lines: () => m.lines, where: m.where }, record, env.site);
    const out = await send(env, {
      to: env.to,
      reply_to: address(person.email) || undefined,
      subject: m.subject,
      text, html
    }, Object.assign({ to: "staff" }, what));
    if (!out.ok) {
      return res.status(502).json({
        error: "resend refused", status: out.status, table: body.table, detail: redact(out.detail)
      });
    }
    return res.status(200).json({ sent: env.to.length, table: body.table, event: "arrived" });
  }

  const who = address(person.email);
  if (!who) {
    return res.status(200).json({ sent: 0, table: body.table, event: body.event, told: false });
  }

  const m = shape(record, person, env.site);
  /* A status with no message written for it. The trigger already filters, but
     the two lists are in different files and only one of them can be right
     when they disagree — so this refuses rather than throwing on m.subject. */
  if (!m) {
    return res.status(200).json({ skipped: String(body.table) + "/" + String(record.status) });
  }

  const out = await send(env, { to: [who], subject: m.subject, text: m.text, html: m.html },
    Object.assign({ to: "person" }, what));
  return res.status(200).json({
    sent: out.ok ? 1 : 0, table: body.table, event: body.event, told: out.ok
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  /* A webhook endpoint is a URL on the public internet, and this one describes
     real applicants. Supabase sends whatever headers you configure, so the
     shared secret goes in one and is compared here. Without WEBHOOK_SECRET set
     the endpoint refuses everything rather than defaulting to open. */
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) {
    return res.status(500).json({ error: "WEBHOOK_SECRET is not set" });
  }
  if (!sameSecret(req.headers["x-webhook-secret"], expected)) {
    return res.status(401).json({ error: "bad secret" });
  }

  /* Every send needs the key. NOTIFY_TO is only needed by the sends that go
     to staff, so it is checked there, not here. */
  const key = process.env.RESEND_API_KEY;
  const to = (process.env.NOTIFY_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.RESEND_FROM || "support@securejobva.com";
  const site = process.env.SITE_URL || "https://www.securejobva.com";
  if (!key) {
    return res.status(500).json({ error: "RESEND_API_KEY is not set" });
  }
  const env = { key, to, from, site };

  /* A body that is not JSON is the caller's mistake, and says so with a 400
     rather than crashing the function into a stack trace and a 500. */
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: "bad json" });
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "bad json" });
  }

  /* A decision from 031 rather than a row landing. Handled first because it is
     the one shape that is not a Supabase webhook and does not look like one. */
  if (body.type === "STATUS") {
    return decision(body, res, env);
  }

  const kind = KINDS[body.table];

  /* Not an error. A webhook on a table nobody asked to hear about is ignored
     quietly, with a 200, so it does not read as a failure where it is logged. */
  if (!kind || body.type !== "INSERT" || !body.record) {
    return res.status(200).json({ skipped: body.table || "unknown" });
  }

  if (!staffOr500(env, res)) return;

  const what = { table: String(body.table), event: "insert", id: body.record.id || null };
  const { text, html } = render(kind, body.record, site);

  const out = await send(env, {
    to,
    /* So hitting reply reaches the person, not the mailbox — when what they
       typed is an address. When it is not, the alert goes without one. */
    reply_to: address(body.record.email) || undefined,
    subject: kind.subject(body.record),
    text,
    html
  }, Object.assign({ to: "staff" }, what));

  if (!out.ok) {
    /* Not a retry request — nothing retries (see send()). The 502 is what
       net._http_response keeps, and the log line is what finds the row. */
    return res.status(502).json({
      error: "resend refused", status: out.status, table: body.table, detail: redact(out.detail)
    });
  }

  /* ── then the applicant's own copy ───────────────────────────────────────
     Second, and never allowed to change the answer. The status code reports
     the email to you, which is the one holding somebody's reply; one
     applicant mistyping their address is their missing confirmation, and it
     is reported in the body, not folded into a 502 that would read as the
     staff alert failing.

     The address has to pass the same rule as everything else here. And what
     the email says is built from values this file controls — see CONFIRM —
     because the address and the text both come from whoever filled in the
     form. */
  const theirs = CONFIRM[body.table];
  const applicant = address(body.record.email);
  if (!theirs || !applicant) {
    return res.status(200).json({ sent: to.length, table: body.table, confirmed: false });
  }

  const c = theirs(body.record, site);
  const mine = await send(env, {
    to: [applicant],
    subject: c.subject,
    text: c.text,
    html: c.html
  }, Object.assign({ to: "applicant" }, what));

  return res.status(200).json({ sent: to.length, table: body.table, confirmed: mine.ok });
}
