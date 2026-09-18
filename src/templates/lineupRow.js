import { html, raw } from '../lib/escape.js';
import { parseLineupText, splitNote } from '../lib/lineup.js';

/**
 * One DJ row's markup, section 9.1 rework: name, set time and genre in
 * their own boxes, a headliner checkbox, and a remove button, in that
 * order, all in one row. Shared by the public submit form, the public
 * edit-your-listing form and the admin event form so the three never
 * drift apart -- public/js/lineup-rows.js's field selectors match these
 * data attributes exactly.
 * @param {{ name?: string, genre?: string, time?: string, headliner?: boolean }} [values]
 */
function lineupRowFields(values = {}) {
  return html`<div class="lineup-row" data-lineup-row>
    <input type="text" data-lineup-name placeholder="DJ name" aria-label="DJ name" value="${values.name || ''}">
    <input type="text" data-lineup-time placeholder="Set time (optional)" aria-label="Set time, optional" value="${values.time || ''}">
    <input type="text" data-lineup-genre placeholder="Genre (optional)" aria-label="Genre, optional" value="${values.genre || ''}">
    <label class="lineup-row-headliner"><input type="checkbox" data-lineup-headliner ${values.headliner ? raw('checked') : ''}> Headliner</label>
    <button type="button" class="secondary" data-remove-dj aria-label="Remove this DJ">&times;</button>
  </div>`;
}

/**
 * The empty row template cloned client-side (public/js/lineup-rows.js) for
 * a freshly added DJ.
 */
export function lineupRowTemplate() {
  return html`<template data-lineup-row-template>${lineupRowFields()}</template>`;
}

/**
 * Server-rendered DJ rows pre-filled from an existing event's lineup text,
 * for the admin event form -- a plain server-rendered page, unlike /edit,
 * so there's no client-side fetch-and-hydrate step to add rows from.
 * @param {string|null} lineup
 */
export function renderLineupRows(lineup) {
  return parseLineupText(lineup).map((act) => {
    const { genre, time } = splitNote(act.note);
    return lineupRowFields({ name: act.name, genre, time, headliner: act.headliner });
  }).join('');
}

/**
 * The full Lineup field: rows container (optionally pre-filled), the empty
 * row template, an "+ Add DJ" button, and the hidden `lineup`/`genres`
 * inputs that public/js/lineup-rows.js keeps in sync with the rows.
 * `genres` is seeded from the event's existing value (or empty for a new
 * submission) rather than left blank, since the aggregated value from the
 * rows only overwrites it once a row's genre box actually holds something
 * -- see serialize() in public/js/lineup-rows.js.
 * @param {{ initialRowsHtml?: string, genres?: string|null }} [options]
 */
export function lineupField(options = {}) {
  return html`<div class="field field-lineup">
    <label>Lineup</label>
    <div data-lineup-rows>${raw(options.initialRowsHtml || '')}</div>
    ${lineupRowTemplate()}
    <input type="hidden" name="lineup" data-lineup-value>
    <input type="hidden" name="genres" data-genres-value value="${options.genres || ''}">
    <div class="actions">
      <button type="button" class="secondary" data-add-dj>+ Add DJ</button>
    </div>
  </div>`;
}

/**
 * The age-restriction control, section 9.1 rework: a single checkbox
 * instead of a three-option select, defaulting to 18+. The checkbox and
 * the hidden fallback below it share the name "age_restriction" and rely
 * on FormData returning the first same-named entry in document order: the
 * checkbox (posting "18+") comes first, so a checked box wins; unchecked,
 * the checkbox drops out of the submission entirely and the hidden
 * "all_ages" is the only entry left. No JS or backend change needed.
 * @param {boolean} [checked] - defaults to true (18+): both a brand new
 *   listing and a legacy event with no age_restriction set yet start ticked
 */
export function ageRestrictionField(checked = true) {
  return html`<div class="field">
    <label class="lineup-row-headliner"><input type="checkbox" name="age_restriction" id="age_restriction" value="18+" ${checked ? raw('checked') : ''}> 18+</label>
    <input type="hidden" name="age_restriction" value="all_ages">
    <p class="muted">Untick for all ages.</p>
  </div>`;
}
