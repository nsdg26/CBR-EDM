// Shared display logic for event cards and event pages. See SPEC.md
// section 8.2 for the status stamp rules.

import { parseLineupText } from './lineup.js';

const STATUS_STAMPS = {
  cancelled: 'CANCELLED',
  sold_out: 'SOLD OUT',
  postponed: 'POSTPONED',
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The stamp text to show on a card or event page, or null for none.
 * @param {{ status: string, location_revealed_at: string|null }} event
 * @param {boolean} isPast
 * @param {Date} [now]
 */
export function stampFor(event, isPast, now = new Date()) {
  if (STATUS_STAMPS[event.status]) return STATUS_STAMPS[event.status];

  if (event.location_revealed_at && !isPast) {
    const revealedAgoMs = now - new Date(event.location_revealed_at);
    if (revealedAgoMs >= 0 && revealedAgoMs <= SEVEN_DAYS_MS) return 'LOCATION DROPPED';
  }

  return null;
}

/**
 * The venue text for a card, per section 8.1: venue name, or a TBA line.
 * @param {{ venue_name: string|null, location_tba: number, location_reveal_at: string|null, location_how_to_find: string|null }} event
 */
export function venueTextFor(event) {
  if (!event.location_tba) return event.venue_name || null;

  const parts = ['Location TBA'];
  if (event.location_reveal_at) parts.push(`revealed ${event.location_reveal_at}`);
  if (event.location_how_to_find) parts.push(event.location_how_to_find);
  return parts.join(', ');
}

/**
 * The lineup names, truncated to the first few acts for a card. Section 8.1.
 * @param {string|null} lineup
 * @param {number} [maxActs]
 */
export function lineupPreview(lineup, maxActs = 3) {
  const acts = parseLineupText(lineup).map((act) => act.name);
  return {
    acts: acts.slice(0, maxActs),
    hasMore: acts.length > maxActs,
  };
}
