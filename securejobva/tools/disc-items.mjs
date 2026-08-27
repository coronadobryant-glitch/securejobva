/* The item bank, and the only place it exists.
 *
 * A forced-choice DISC is twelve groups of four words. In each group the
 * applicant marks the one word most like them and the one least like them.
 * Every word belongs to exactly one of D, I, S or C, so twelve groups give
 * twelve votes for and twelve against, and the difference is the profile.
 *
 * Forced choice rather than a rating scale on purpose. Asked "are you
 * dependable, 1 to 5", everybody applying for a job says 5, and the answers
 * carry no information. Made to choose between four words that are all
 * flattering, they have to tell you something.
 *
 * The word order inside each group is deliberately shuffled: with D always
 * first, somebody who works out the pattern can pick a column. It also means
 * the letters are not derivable from the page, which is why the browser sends
 * the positions it ticked and the database does the scoring — sql/021 holds
 * this same map and is generated from this file, so the two cannot drift.
 *
 * The words are chosen to be plain. Most people filling this in are working in
 * their second language, and a word they have to guess at is a wrong answer
 * about their personality rather than their English.
 */

export const GROUPS = [
  [["Patient", "S"],        ["Direct", "D"],       ["Careful", "C"],           ["Cheerful", "I"]],
  [["Talkative", "I"],      ["Accurate", "C"],     ["Decisive", "D"],          ["Steady", "S"]],
  [["Precise", "C"],        ["Calm", "S"],         ["Friendly", "I"],          ["Competitive", "D"]],
  [["Bold", "D"],           ["Loyal", "S"],        ["Persuasive", "I"],        ["Cautious", "C"]],
  [["Easy-going", "S"],     ["Thorough", "C"],     ["Firm", "D"],              ["Optimistic", "I"]],
  [["Outgoing", "I"],       ["Follows the rules", "C"], ["Good listener", "S"], ["Takes charge", "D"]],
  [["Methodical", "C"],     ["Blunt", "D"],        ["Dependable", "S"],        ["Playful", "I"]],
  [["Warm", "I"],           ["Gentle", "S"],       ["Questioning", "C"],       ["Driven", "D"]],
  [["Consistent", "S"],     ["Quick to act", "D"], ["Exact", "C"],             ["Enthusiastic", "I"]],
  [["Expressive", "I"],     ["Reserved", "C"],     ["Strong-willed", "D"],     ["Supportive", "S"]],
  [["Checks the detail", "C"], ["Even-tempered", "S"], ["Sociable", "I"],      ["Takes risks", "D"]],
  [["Agreeable", "S"],      ["Demanding", "D"],    ["Systematic", "C"],        ["Charming", "I"]]
];

/* What each letter means, in the words a hiring manager would use rather than
 * the words a personality manual would. Shown on the applicant's result and in
 * the admin row, because a bare letter tells nobody anything. */
export const STYLES = {
  D: {
    name: "Driver",
    blurb: "Moves fast and decides. Best where somebody has to take the call and own it.",
    fits: "Escalations, outbound sales, anything with a target on it"
  },
  I: {
    name: "Persuader",
    blurb: "Warm and quick with people. Best where the job is talking to somebody all day.",
    fits: "Front-line customer service, lead follow-up, appointment setting"
  },
  S: {
    name: "Steady",
    blurb: "Patient and consistent. Best where the same job has to be done well every day.",
    fits: "Inbox and calendar, long-running client accounts, support"
  },
  C: {
    name: "Checker",
    blurb: "Careful and exact. Best where a mistake is expensive.",
    fits: "Bookkeeping, data entry, invoicing, documents"
  }
};

export const LETTERS = ["D", "I", "S", "C"];
