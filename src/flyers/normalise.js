// Normalises a raw D1 event row into the flyer data contract,
// PROJECT-C-EDM-FLYER-ENGINE-SPEC.md section 5. This is the only file in
// the flyer engine that knows about the events table's actual columns.

import { toCanberraParts } from '../lib/dates.js';
import { isEventPast } from '../lib/dates.js';
import { actsWithHeadliners } from '../lib/lineup.js';

const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * The contour template's real-world terrain (section 7, owner request):
 * only ever surfaced for a disclosed venue, never a location_tba event --
 * defence in depth, since fetchRealTerrain (src/lib/geocode.js) is also
 * never called for one. Returns null on any parse failure, same as a
 * field that was never fetched.
 * @param {string|null} json
 * @param {boolean} locationTba
 */
function elevationGridFor(json, locationTba) {
  if (!json || locationTba) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.values) || !parsed.size) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string|null} genres - free text, comma/slash separated
 */
function genresFor(genres) {
  if (!genres) return [];
  return genres.split(/[,/]/).map((g) => g.trim().toLowerCase()).filter(Boolean);
}

/**
 * Section 5: same precedence as stampFor() in lib/eventDisplay.js, so the
 * flyer and the HTML card never disagree about an event's status.
 */
function statusFor(event, now) {
  if (['cancelled', 'sold_out', 'postponed'].includes(event.status)) return event.status;

  if (event.location_revealed_at) {
    const revealedAgoMs = now - new Date(event.location_revealed_at);
    const isPast = isEventPast(event, now);
    if (revealedAgoMs >= 0 && revealedAgoMs <= SEVEN_DAYS_MS && !isPast) return 'location_dropped';
  }

  return 'ok';
}

/**
 * @param {object} event - a row from the events table, optionally joined with crews.name AS crew_name
 * @param {{ now?: Date, surface?: string }} [options]
 */
export function normaliseEvent(event, options = {}) {
  const now = options.now || new Date();
  // Section 9.1 rework: headliner is now an explicit per-act flag (the DJ
  // row's "headliner" checkbox), not inferred from position. A legacy
  // plain lineup keeps the old first-act-is-headliner convention (see
  // lib/lineup.js), so any previously published flyer looks the same as
  // it always did.
  const acts = actsWithHeadliners(event.lineup, event.lineup_equal_billing);
  const headlinerActs = acts.filter((act) => act.headliner);
  const headliner = headlinerActs[0]?.name || acts[0]?.name || event.title || null;

  let dateLong = null;
  let dateShort = null;
  let dateNumeric = null;
  let year = null;
  let doors = null;
  let close = null;

  if (event.start_at) {
    const start = toCanberraParts(event.start_at);
    dateLong = `${WEEKDAYS_FULL[start.weekdayIndex]} ${start.day} ${MONTHS_FULL[start.month - 1]}`;
    dateShort = `${WEEKDAYS_FULL[start.weekdayIndex].slice(0, 3).toUpperCase()} ${pad(start.day)}.${pad(start.month)}`;
    dateNumeric = `${pad(start.day)}/${pad(start.month)}/${start.year}`;
    year = String(start.year);
    doors = `${pad(start.hour)}:${pad(start.minute)}`;
  }
  if (event.end_at) {
    const end = toCanberraParts(event.end_at);
    close = `${pad(end.hour)}:${pad(end.minute)}`;
  }

  return {
    id: event.id,
    seedSalt: event.seed_salt || 0,
    headliner,
    title: event.title || null,
    presenter: event.crew_name || event.presented_by || null,
    acts,
    dateLong,
    dateShort,
    dateNumeric,
    year,
    doors,
    close,
    venueName: event.location_tba ? null : (event.venue_name || null),
    locationTba: Boolean(event.location_tba),
    locationNote: event.location_tba
      ? [event.location_reveal_at, event.location_how_to_find].filter(Boolean).join(', ') || null
      : null,
    genres: genresFor(event.genres),
    // No price field, deliberately: it's on the ticket link, and prices
    // that tier (presale/door, member/guest...) read as confusing or
    // stale printed flat on a flyer. Owner request.
    ageRestriction: event.age_restriction === '18+' ? '18+' : null,
    status: statusFor(event, now),
    surface: options.surface || 'page',
    elevationGrid: elevationGridFor(event.elevation_grid, Boolean(event.location_tba)),
  };
}

/**
 * A short, stable hash of only the fields the flyer engine actually reads,
 * for the cache key (section 4.2): editing a field the flyer doesn't
 * render must not bust the cache.
 * @param {object} event
 */
export function flyerDataHash(event) {
  const relevant = [
    event.title, event.presented_by, event.lineup, event.lineup_equal_billing, event.start_at, event.end_at,
    event.venue_name, event.location_tba, event.location_reveal_at, event.location_how_to_find,
    event.genres, event.age_restriction, event.status,
    event.location_revealed_at, event.crew_name, event.flyer_template, event.seed_salt,
    event.elevation_grid,
  ].map((v) => (v === null || v === undefined ? '' : String(v))).join('|');

  let hash = 0x811c9dc5;
  for (let i = 0; i < relevant.length; i++) {
    hash ^= relevant.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
