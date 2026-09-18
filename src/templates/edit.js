import { html } from '../lib/escape.js';
import { lineupField, ageRestrictionField } from './lineupRow.js';

const FIELD_DEFS_BEFORE_LINEUP = [
  ['title', 'Title', 'text'],
  ['presented_by', 'Presented by', 'text'],
  ['start_at_local', 'Start (Canberra time)', 'datetime-local'],
  ['end_at_local', 'End (Canberra time, leave blank for "til late")', 'datetime-local'],
  ['venue_name', 'Venue name', 'text'],
  ['venue_address', 'Venue address', 'text'],
  ['location_reveal_at', 'When will the location be announced?', 'text'],
  ['location_how_to_find', 'How will people find out?', 'text'],
];

const FIELD_DEFS_AFTER_LINEUP = [
  ['ticket_url', 'Ticket URL', 'url'],
  ['notes', 'Anything else worth knowing', 'textarea'],
];

function renderField([name, label, type]) {
  return html`<div class="field">
    <label for="${name}">${label}</label>
    ${type === 'textarea'
      ? html`<textarea id="${name}" name="${name}"></textarea>`
      : type === 'url'
        ? html`<input type="text" inputmode="url" id="${name}" name="${name}">`
        : html`<input type="${type}" id="${name}" name="${name}">`}
  </div>`;
}

/**
 * GET /edit. Section 9.2: JavaScript reads the token from the URL
 * fragment and loads the event. The form markup here is static; JS fills
 * in field .value from the loaded data (never innerHTML, section 12).
 */
export function editPage() {
  return html`
    <h1>Edit your listing</h1>
    <p data-edit-status role="status">Loading...</p>

    <form data-edit-form hidden>
      <p data-edit-review-note class="error" hidden>This event is already published. Your changes will be reviewed by the admin before they go live.</p>

      ${FIELD_DEFS_BEFORE_LINEUP.map(renderField)}

      ${lineupField()}

      ${FIELD_DEFS_AFTER_LINEUP.map(renderField)}

      <div class="field">
        <label><input type="checkbox" name="location_tba" id="location_tba" value="1"> Location TBA</label>
      </div>

      ${ageRestrictionField()}

      <button type="submit">Save changes</button>
      <p data-edit-save-status role="status"></p>
    </form>

    <div data-edit-actions hidden>
      <h2>Cancel or remove this listing</h2>
      <p>These always go to the admin for review, even for your own listing.</p>
      <div class="field">
        <label for="reason">Reason (optional)</label>
        <textarea id="reason" name="reason"></textarea>
      </div>
      <div class="actions">
        <button type="button" data-request="cancel">Request cancellation</button>
        <button type="button" data-request="removal" class="danger">Request removal</button>
      </div>
      <p data-request-status role="status"></p>
    </div>

    <noscript><p class="error">This page needs JavaScript to load your listing without sending your edit link to the server in the address bar.</p></noscript>
  `;
}
