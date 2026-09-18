// iCalendar (RFC 5545) generation. See SPEC.md section 11.1.

import { parseLineupText } from './lineup.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const LINE_LENGTH = 75;

/**
 * Escapes text per RFC 5545 section 3.3.11: backslash, semicolon, comma
 * and newline.
 * @param {string} text
 */
function icsEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Folds a single content line to at most 75 octets per output line, with a
 * leading space marking each continuation, per RFC 5545 section 3.1.
 * @param {string} line
 */
function foldLine(line) {
  if (line.length <= LINE_LENGTH) return line;
  let out = line.slice(0, LINE_LENGTH);
  let rest = line.slice(LINE_LENGTH);
  while (rest.length) {
    out += '\r\n ' + rest.slice(0, LINE_LENGTH - 1);
    rest = rest.slice(LINE_LENGTH - 1);
  }
  return out;
}

function toIcsDateUtc(isoUtc) {
  return new Date(isoUtc).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Builds one VEVENT block for an event, section 11.1.
 * @param {object} event - a published event row
 * @param {string} domain - the site's domain, for UID and URL
 * @param {Date} [now] - for DTSTAMP
 */
export function eventToVEvent(event, domain, now = new Date()) {
  const dtStart = toIcsDateUtc(event.start_at);
  const dtEnd = event.end_at
    ? toIcsDateUtc(event.end_at)
    : toIcsDateUtc(new Date(new Date(event.start_at).getTime() + SIX_HOURS_MS).toISOString());

  const location = event.location_tba
    ? 'Location TBA, see event page'
    : [event.venue_name, event.venue_address].filter(Boolean).join(', ');

  const lineupNames = parseLineupText(event.lineup).map((act) => act.name).join(', ');

  const descriptionParts = [
    event.crew_name || event.presented_by,
    lineupNames || null,
    `https://${domain}/e/${event.slug}`,
  ].filter(Boolean);

  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@${domain}`,
    `SEQUENCE:${event.sequence || 0}`,
    `DTSTAMP:${toIcsDateUtc(now.toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(event.title || 'Untitled event')}`,
    location ? `LOCATION:${icsEscape(location)}` : null,
    `DESCRIPTION:${icsEscape(descriptionParts.join('\\n'))}`,
    `URL:https://${domain}/e/${event.slug}`,
    event.status === 'cancelled' ? 'STATUS:CANCELLED' : null,
    'END:VEVENT',
  ].filter(Boolean);

  return lines.map(foldLine).join('\r\n');
}

/**
 * Wraps one or more VEVENT blocks in a VCALENDAR, section 11.1.
 * @param {object[]} events
 * @param {string} domain
 * @param {Date} [now]
 */
export function buildCalendar(events, domain, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CBR EDM//EN',
    'CALSCALE:GREGORIAN',
    ...events.filter((event) => event.start_at).map((event) => eventToVEvent(event, domain, now)),
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
