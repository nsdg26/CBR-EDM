import { html, raw } from '../../lib/escape.js';
import { render as renderFlyer } from '../../flyers/index.js';
import { lineupField, renderLineupRows, ageRestrictionField } from '../lineupRow.js';

/**
 * GET /admin/events. List with search by title, section 10.2.
 * @param {object[]} events
 * @param {string} query - current search text
 */
export function eventListPage(events, query) {
  return html`
    <h1>Events</h1>
    <form method="get" class="field">
      <label for="q">Search by title</label>
      <input type="search" id="q" name="q" value="${query || ''}">
      <button type="submit">Search</button>
    </form>
    <p><a href="/admin/events/new" class="button">Add an event</a></p>
    <table>
      <thead>
        <tr><th>Title</th><th>Start</th><th>Visibility</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${events.map((event) => html`<tr>
          <td>${event.title || 'Untitled'}</td>
          <td>${event.start_at ? event.start_at.slice(0, 10) : '-'}</td>
          <td>${event.visibility}</td>
          <td>${event.status}</td>
          <td><a href="/admin/events/${event.id}/edit">Edit</a></td>
        </tr>`)}
      </tbody>
    </table>
  `;
}

const FIELD_DEFS_BEFORE_LINEUP = [
  ['title', 'Title', 'text'],
  ['presented_by', 'Presented by (free text, leave blank if using the crew field below)', 'text'],
  ['start_at_local', 'Start (Canberra time)', 'datetime-local'],
  ['end_at_local', 'End (Canberra time, leave blank for "til late")', 'datetime-local'],
  ['venue_name', 'Venue name', 'text'],
  ['venue_address', 'Venue address', 'text'],
  ['location_reveal_at', 'Location reveal date (if TBA)', 'text'],
  ['location_how_to_find', 'How people will find out (if TBA)', 'text'],
];

const FIELD_DEFS_AFTER_LINEUP = [
  ['ticket_url', 'Ticket URL', 'url'],
  ['notes', 'Notes (event page only)', 'textarea'],
];

function renderField([name, label, type], event) {
  return html`<div class="field">
    <label for="${name}">${label}</label>
    ${type === 'textarea'
      ? html`<textarea id="${name}" name="${name}">${event[name] || ''}</textarea>`
      : type === 'url'
        ? html`<input type="text" inputmode="url" id="${name}" name="${name}" value="${event[name] || ''}">`
        : html`<input type="${type}" id="${name}" name="${name}" value="${event[name] || ''}">`}
  </div>`;
}

/**
 * GET/POST /admin/events/new and /admin/events/:id/edit. Section 10.2.
 * @param {object} event - existing event row, or an empty object for a new one
 * @param {object[]} crews - for the crew picker
 * @param {{ errors?: string[] }} [options]
 */
export function eventFormPage(event, crews, options = {}) {
  const isNew = !event.id;
  const action = isNew ? '/admin/events/new' : `/admin/events/${event.id}/edit`;

  return html`
    <h1>${isNew ? 'Add an event' : `Edit: ${event.title || 'Untitled'}`}</h1>
    ${event.submitter_contact
      ? html`<p class="error">Submitter contact (private, never published): ${event.submitter_contact}</p>`
      : ''}
    ${options.errors?.length
      ? html`<ul class="field-error">${options.errors.map((error) => html`<li>${error}</li>`)}</ul>`
      : ''}
    <form method="post" action="${action}">
      ${FIELD_DEFS_BEFORE_LINEUP.map((def) => renderField(def, event))}

      ${lineupField({ initialRowsHtml: renderLineupRows(event.lineup), genres: event.genres })}

      <div class="field">
        <label><input type="checkbox" name="lineup_equal_billing" value="1" ${event.lineup_equal_billing ? raw('checked') : ''}> Equal billing (no headliner -- list every act on the flyer at the same size)</label>
      </div>

      ${FIELD_DEFS_AFTER_LINEUP.map((def) => renderField(def, event))}

      <div class="field">
        <label for="crew_id">Crew</label>
        <select id="crew_id" name="crew_id">
          <option value="">None (use presented by, above)</option>
          ${crews.map((crew) => html`<option value="${crew.id}" ${crew.id === event.crew_id ? raw('selected') : ''}>${crew.name}</option>`)}
        </select>
      </div>

      <div class="field">
        <label><input type="checkbox" name="location_tba" value="1" ${event.location_tba ? raw('checked') : ''}> Location TBA</label>
      </div>

      ${ageRestrictionField(event.age_restriction !== 'all_ages')}

      <div class="field">
        <label for="status">Status</label>
        <select id="status" name="status">
          ${['on', 'cancelled', 'sold_out', 'postponed'].map((value) => html`<option value="${value}" ${event.status === value ? raw('selected') : ''}>${value}</option>`)}
        </select>
      </div>

      <button type="submit">Save</button>
    </form>

    ${!isNew ? adminEventActions(event, options) : ''}
  `;
}

function adminEventActions(event, options = {}) {
  return html`
    <h2>Flyer</h2>
    ${options.fromEmailId
      ? html`<div>
          <p>This event was converted from an email. Its attached image, for reference (the flyer itself is always the generated contour map below):</p>
          <img src="/admin/api/inbound-emails/${options.fromEmailId}/attachments/0" alt="Attachment from the source email" width="200">
        </div>`
      : ''}

    ${generatedFlyerSection(event)}

    <h2>Edit link</h2>
    ${event.newEditLink
      ? html`<p class="error">New edit link (shown once, copy it now): <code>${event.newEditLink}</code></p>`
      : ''}
    <div class="actions">
      <form method="post" action="/admin/events/${event.id}/reissue-edit-link">
        <button type="submit">${event.edit_token_hash ? 'Issue a new edit link' : 'Issue an edit link'}</button>
      </form>
      ${event.edit_token_hash
        ? html`<form method="post" action="/admin/events/${event.id}/revoke-edit-link" data-confirm="Revoke this event's edit link? The submitter will no longer be able to use it."><button type="submit" class="secondary">Revoke edit link</button></form>`
        : ''}
    </div>

    <h2>Actions</h2>
    <div class="actions">
      ${event.visibility === 'pending'
        ? html`<form method="post" action="/admin/events/${event.id}/publish"><button type="submit">Publish</button></form>
               <form method="post" action="/admin/events/${event.id}/reject"><button type="submit" class="secondary">Reject</button></form>`
        : ''}
      ${event.visibility === 'published'
        ? html`<form method="post" action="/admin/events/${event.id}/remove"><button type="submit" class="secondary">Unpublish</button></form>`
        : ''}
      ${event.visibility === 'removed' || event.visibility === 'rejected'
        ? html`<form method="post" action="/admin/events/${event.id}/restore"><button type="submit">Restore to published</button></form>`
        : ''}
      <form method="post" action="/admin/events/${event.id}/delete" data-confirm="Permanently delete this event and its images? This cannot be undone.">
        <button type="submit" class="danger">Delete permanently</button>
      </form>
    </div>
  `;
}

/**
 * The admin picker, FLYER-ENGINE-SPEC.md section 13. Used to be a live
 * preview plus a template dropdown ("Auto" shows what genre routing
 * actually picked), a Reroll button, and a compare grid rendering the
 * event through all ten templates.
 *
 * Owner decision (2026-09-13, then again 2026-09-14): stick purely to the
 * real contour map, with no way to choose anything else on this screen --
 * every event always renders with contour, so the dropdown and compare
 * grid are removed here entirely. The other nine templates are no longer
 * in the codebase at all (see manifest.js), so this markup is not coming
 * back unchanged the way it might have when they were merely archived
 * from selection -- see git history/CHANGELOG.md if template choice is
 * ever wanted again. The Reroll button stays -- it's not about choosing
 * a template, just about this one, contour. The manual "Fetch real
 * terrain" button is gone too (owner decision, 2026-09-14): terrain is
 * now fetched automatically on every save (see geocode.js's
 * terrainFieldsFor, called from handleEventCreate/handleEventUpdate),
 * so there is nothing left for a separate button to do.
 * @param {object} event
 */
function generatedFlyerSection(event) {
  const preview = renderFlyer(event, { surface: 'page' });

  return html`
    <h2>Generated flyer</h2>
    <p class="muted">Always rendered with the contour map template.
      ${event.location_tba
        ? 'Location TBA, so this uses a procedural map, never a real one.'
        : event.elevation_grid
          ? 'Drawing this venue\'s real terrain, fetched automatically when the venue was saved.'
          : 'Drawing a procedural map -- the venue could not be geocoded to real terrain. Re-saving the event tries again.'}
    </p>

    ${preview
      ? html`<div class="generated-flyer-preview" style="max-width: 300px;">${raw(preview.svg)}</div>`
      : html`<p class="error">Could not render a flyer for this event.</p>`}

    <form method="post" action="/admin/events/${event.id}/reroll-flyer">
      <button type="submit" class="secondary">Reroll (new random variation)</button>
    </form>
  `;
}

// The template picker (the "Set template" dropdown and the "Compare
// templates" grid) was removed here, owner decision 2026-09-13: no way
// to choose anything but contour on this screen. See git history for the
// removed markup.
