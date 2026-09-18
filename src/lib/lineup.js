// Shared lineup parsing, used by the flyer engine, the event card/page and
// the calendar feed so they never disagree about what's in event.lineup.
//
// Storage stays exactly what it always was -- a plain TEXT column, one act
// per line -- so a legacy lineup ("Deep Signal\nSupport Act", no
// lineup_equal_billing set) keeps rendering exactly as it always did: the
// first line is the headliner, the position of that headliner effectively
// comes for free. The new DJ-row submit form (section 9.1 rework) instead
// writes each line as "Name | note | headliner", always including at least
// one "|" -- that's the signal a line was written by the new form rather
// than typed or hand-edited as a bare name, and it's what lets a
// deliberately headliner-less new-format lineup (every row unchecked) read
// as "equal billing" instead of silently falling back to "first act is the
// headliner".

/**
 * @param {string} line - one line of a "new format" (pipe-delimited) lineup
 */
function parsePipeLine(line) {
  const parts = line.split('|').map((part) => part.trim());
  const headliner = parts.length > 2 && parts[parts.length - 1].toLowerCase() === 'headliner';
  const noteParts = headliner ? parts.slice(1, -1) : parts.slice(1);
  const note = noteParts.join(' | ').trim() || null;
  return { name: parts[0], note, headliner };
}

/**
 * Parses raw event.lineup text into acts, in submission order. Never
 * throws, never drops a line.
 * @param {string|null} lineup
 * @returns {{ name: string, note: string|null, headliner: boolean }[]}
 */
export function parseLineupText(lineup) {
  if (!lineup) return [];
  const rawLines = lineup.split('\n').map((line) => line.trim()).filter(Boolean);
  const isNewFormat = rawLines.some((line) => line.includes('|'));
  if (!isNewFormat) return rawLines.map((name) => ({ name, note: null, headliner: false }));
  return rawLines.map(parsePipeLine);
}

/**
 * Acts with their final headliner flag resolved: new-format lineups use
 * exactly what was checked (which may be none, read as equal billing, or
 * several); a legacy plain lineup falls back to the old convention (first
 * act is the headliner) unless lineup_equal_billing was set, so every
 * previously published flyer keeps its current look.
 * @param {string|null} lineup
 * @param {boolean|number} [legacyEqualBilling]
 */
export function actsWithHeadliners(lineup, legacyEqualBilling = false) {
  const acts = parseLineupText(lineup);
  if (!acts.length) return acts;

  const isNewFormat = (lineup || '').split('\n').some((line) => line.includes('|'));
  if (isNewFormat) return acts;

  return acts.map((act, i) => ({ ...act, headliner: !legacyEqualBilling && i === 0 }));
}

/**
 * The line format the DJ-row submit form writes, section 9.1: always at
 * least one "|" so a deliberately headliner-less lineup is distinguishable
 * from a legacy bare-name one (see module comment above).
 * @param {{ name: string, note?: string, headliner?: boolean }} act
 */
export function serializeLineupLine(act) {
  const name = (act.name || '').trim();
  const note = (act.note || '').trim();
  let line = `${name} | ${note}`;
  if (act.headliner) line += ' | headliner';
  return line;
}

// Section 9.1 rework: the DJ-row form splits "note" into two visible boxes,
// Genre and Set time, joined back into one note string with this separator
// so storage (and anything that displays a note verbatim, e.g. the event
// page) stays exactly what it always was -- free text, one note per act.
// A note that predates this split (typed by hand, or written before this
// feature existed) simply has no NOTE_PART_SEPARATOR in it, so splitNote
// puts all of it in "genre" and leaves "time" empty rather than guessing or
// dropping anything -- re-serializing an untouched row reproduces the exact
// same note.
const NOTE_PART_SEPARATOR = ' · ';

/**
 * @param {string|null} note
 * @returns {{ genre: string, time: string }}
 */
export function splitNote(note) {
  const trimmed = (note || '').trim();
  if (!trimmed) return { genre: '', time: '' };
  const idx = trimmed.indexOf(NOTE_PART_SEPARATOR);
  if (idx === -1) return { genre: trimmed, time: '' };
  return { genre: trimmed.slice(0, idx).trim(), time: trimmed.slice(idx + NOTE_PART_SEPARATOR.length).trim() };
}

/**
 * @param {string} [genre]
 * @param {string} [time]
 * @returns {string}
 */
export function joinNote(genre, time) {
  const g = (genre || '').trim();
  const t = (time || '').trim();
  if (g && t) return `${g}${NOTE_PART_SEPARATOR}${t}`;
  return g || t;
}
