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
   expect is a different decision from keeping this one. */
const CONFIRM = {
  applications: (r, site) => {
    const first = String(r.name || "").trim().split(/\s+/)[0] || "there";
    const what = list(r.tracks) || r.track || "";

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

function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

function firstName(s) {
  return String(s || "").trim().split(/\s+/)[0] || "there";
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

function fullDate(iso) {
  const p = String(iso || "").split("-");
  if (p.length !== 3) return "";
  return Number(p[2]) + " " + MONTH[Number(p[1]) - 1] + " " + p[0];
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
  interview: {
    subject: "Your application — interview next",
    lead: "has moved on to the interview",
    body: "One interview with us, on how you work and on your setup and " +
      "connection. We will be in touch to arrange it.",
    where: "/status", label: "See where you are"
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
    offered: (r, p, site) => ({
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
            ? "Where: <a href=\"" + esc(r.meeting_url) + "\">" + esc(r.meeting_url) + "</a>"
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
  }
};

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

/* One place that talks to Resend, so the from address and the auth header are
   written once rather than three times. Returns whether it landed; the caller
   decides what that means. */
async function send(env, msg) {
  const r = await fetch(RESEND, {
    method: "POST",
    headers: { Authorization: "Bearer " + env.key, "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ from: "SecureJobVA <" + env.from + ">" }, msg))
  }).catch(() => null);
  return !!(r && r.ok);
}

/* A decision, and which way it is going is the whole difference.

   `arrived` goes to you and Bryant, and its failure must be retried — it is
   the one holding somebody's answer, so its status code decides the response
   exactly as an application's does.

   `decided` goes to the assistant and is attempted once. Same rule the
   applicant confirmation already follows: a dead address costs one missing
   email, and never a webhook that mails the same decision forever. */
async function decision(body, res, env) {
  const shapes = DECIDE[body.table];
  const shape = shapes && shapes[body.event];
  const person = body.person || {};
  const record = body.record || {};

  /* A status nobody asked to hear about is ignored quietly, and 200 stops it
     being retried for the rest of its life. */
  if (!shape) {
    return res.status(200).json({ skipped: String(body.table) + "/" + String(body.event) });
  }

  if (body.event === "arrived") {
    const m = shape(record, person, env.site);
    /* Rendered through the same function the other three notifications use, so
       there is one table style and not a second one drifting away from it. */
    const { text, html } = render({ lines: () => m.lines, where: m.where }, record, env.site);
    const landed = await send(env, {
      to: env.to,
      reply_to: person.email || undefined,
      subject: m.subject,
      text, html
    });
    if (!landed) {
      return res.status(502).json({ error: "resend refused", table: body.table });
    }
    return res.status(200).json({ sent: env.to.length, table: body.table, event: "arrived" });
  }

  const who = String(person.email || "").trim();
  if (!who.includes("@")) {
    return res.status(200).json({ sent: 0, table: body.table, event: "decided", told: false });
  }

  const m = shape(record, person, env.site);
  /* A status with no message written for it. The trigger already filters, but
     the two lists are in different files and only one of them can be right
     when they disagree — so this refuses rather than throwing on m.subject. */
  if (!m) {
    return res.status(200).json({ skipped: String(body.table) + "/" + String(record.status) });
  }

  const told = await send(env, { to: [who], subject: m.subject, text: m.text, html: m.html });
  return res.status(200).json({
    sent: told ? 1 : 0, table: body.table, event: "decided", told
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
  if (req.headers["x-webhook-secret"] !== expected) {
    return res.status(401).json({ error: "bad secret" });
  }

  const key = process.env.RESEND_API_KEY;
  const to = (process.env.NOTIFY_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.RESEND_FROM || "support@securejobva.com";
  const site = process.env.SITE_URL || "https://www.securejobva.com";
  if (!key || !to.length) {
    return res.status(500).json({ error: "RESEND_API_KEY or NOTIFY_TO is not set" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  /* A decision from 031 rather than a row landing. Handled first because it is
     the one shape that is not a Supabase webhook and does not look like one. */
  if (body.type === "STATUS") {
    return decision(body, res, { key, to, from, site });
  }

  const kind = KINDS[body.table];

  /* Not an error. A webhook on a table nobody asked to hear about should be
     ignored quietly, and answering 200 stops Supabase retrying it forever. */
  if (!kind || body.type !== "INSERT" || !body.record) {
    return res.status(200).json({ skipped: body.table || "unknown" });
  }

  const { text, html } = render(kind, body.record, site);

  const r = await fetch(RESEND, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SecureJobVA <" + from + ">",
      to,
      /* So hitting reply reaches the person, not the mailbox. */
      reply_to: body.record.email || undefined,
      subject: kind.subject(body.record),
      text,
      html
    })
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    /* Non-2xx tells Supabase to retry, which is what you want: a Resend outage
       should delay the email, not lose it. */
    return res.status(502).json({ error: "resend refused", detail: detail.slice(0, 300) });
  }

  /* ── then the applicant's own copy ───────────────────────────────────────
     Second, and deliberately not allowed to change the answer. A retry is
     driven by the status code, so if this send decided it, one applicant
     mistyping their address would put the whole webhook in a retry loop —
     mailing you about the same application over and over while never reaching
     them. Costly in the wrong direction.

     So the failure that matters is the one to you: that is the one that must
     be retried until it lands, because it is the one holding somebody's reply.
     This one is attempted once, its outcome is reported, and it never turns a
     delivered notification into a repeated one. */
  const theirs = CONFIRM[body.table];
  const applicant = String(body.record.email || "").trim();
  if (!theirs || !applicant.includes("@")) {
    return res.status(200).json({ sent: to.length, table: body.table, confirmed: false });
  }

  const c = theirs(body.record, site);
  const sentToThem = await fetch(RESEND, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SecureJobVA <" + from + ">",
      to: [applicant],
      subject: c.subject,
      text: c.text,
      html: c.html
    })
  }).then((x) => x.ok).catch(() => false);

  return res.status(200).json({ sent: to.length, table: body.table, confirmed: sentToThem });
}
