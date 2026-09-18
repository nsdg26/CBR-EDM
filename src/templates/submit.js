import { html } from '../lib/escape.js';

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

const STEP_COUNT = 4;

/**
 * One DJ row's static template, cloned client-side by public/js/submit-form.js
 * (section 9.1 rework: individual DJ rows replace the single lineup
 * textarea). The name/note/headliner values are serialised into the
 * hidden `lineup` field just before submit -- see serializeLineupLine in
 * src/lib/lineup.js, which this markup's fields mirror.
 */
function lineupRowTemplate() {
  return html`<template data-lineup-row-template>
    <div class="lineup-row" data-lineup-row>
      <input type="text" data-lineup-name placeholder="DJ name" aria-label="DJ name">
      <input type="text" data-lineup-note placeholder="Genre / set time (optional)" aria-label="Genre or set time, optional">
      <label class="lineup-row-headliner"><input type="checkbox" data-lineup-headliner> Headliner</label>
      <button type="button" class="secondary" data-remove-dj aria-label="Remove this DJ">&times;</button>
    </div>
  </template>`;
}

/**
 * GET /submit. Section 9.1: no field is required. The private contact
 * field sits visually apart from the public fields. Presented as a
 * step-by-step wizard rather than one long scrolling form; every field
 * still posts in a single request exactly as before, JavaScript just
 * shows one step at a time.
 * @param {string} turnstileSiteKey
 * @param {string[]} [crewNames] - for the "presented by" suggestions, section 9.1 rework
 */
export function submitFormPage(turnstileSiteKey, crewNames = []) {
  return html`
    <h1>Submit an event</h1>

    <form data-submit-form data-turnstile-sitekey="${turnstileSiteKey}" action="/api/submissions" method="post">
      <p class="step-progress" aria-live="polite">Step <span data-step-current>1</span> of ${STEP_COUNT}</p>

      <div class="form-wizard">
        <fieldset class="form-step is-active" data-step="1">
          <h2>The basics</h2>
          ${renderField(['title', 'Title', 'text'])}
          <div class="field">
            <label for="presented_by">Presented by</label>
            <input type="text" id="presented_by" name="presented_by" list="presented-by-crews" autocomplete="off">
            <datalist id="presented-by-crews">
              ${crewNames.map((name) => html`<option value="${name}">`)}
            </datalist>
          </div>
          <div class="actions">
            <button type="button" data-next>Next</button>
          </div>
        </fieldset>

        <fieldset class="form-step" data-step="2">
          <h2>When and where</h2>
          ${[
            ['start_at_local', 'Start (Canberra time)', 'datetime-local'],
            ['end_at_local', 'End (Canberra time, leave blank for "til late")', 'datetime-local'],
            ['venue_name', 'Venue name', 'text'],
            ['venue_address', 'Venue address', 'text'],
          ].map(renderField)}
          <div class="field field-checkbox">
            <label><input type="checkbox" name="location_tba" value="1" data-tba-toggle> Location TBA</label>
          </div>
          <div class="field" data-tba-fields hidden>
            <label for="location_reveal_at">When will the location be announced?</label>
            <input type="text" id="location_reveal_at" name="location_reveal_at">
            <label for="location_how_to_find">How will people find out?</label>
            <input type="text" id="location_how_to_find" name="location_how_to_find">
          </div>
          <p data-venue-check-status role="status" class="muted"></p>
          <div class="actions">
            <button type="button" class="secondary" data-back>Back</button>
            <button type="button" data-next>Next</button>
          </div>
        </fieldset>

        <fieldset class="form-step" data-step="3">
          <h2>The details</h2>
          ${renderField(['genres', 'Genre', 'text'])}

          <div class="field">
            <label>Lineup</label>
            <div data-lineup-rows></div>
            ${lineupRowTemplate()}
            <input type="hidden" name="lineup" data-lineup-value>
            <div class="actions">
              <button type="button" class="secondary" data-add-dj>+ Add DJ</button>
            </div>
          </div>

          ${[
            ['ticket_url', 'Ticket URL', 'url'],
            ['notes', 'Anything else worth knowing', 'textarea'],
          ].map(renderField)}
          <div class="field">
            <label for="age_restriction">Age restriction</label>
            <select id="age_restriction" name="age_restriction">
              <option value="unknown" selected>Not sure / not set</option>
              <option value="18+">18+</option>
              <option value="all_ages">All ages</option>
            </select>
          </div>
          <div class="actions">
            <button type="button" class="secondary" data-back>Back</button>
            <button type="button" data-next>Next</button>
          </div>
        </fieldset>

        <fieldset class="form-step" data-step="4">
          <h2>Last thing</h2>
          <details class="field">
            <summary>Got a crew key?</summary>
            <label for="crew_key">Crew key</label>
            <input type="password" id="crew_key" name="crew_key" autocomplete="off">
            <p class="muted">If your crew is trusted, this publishes the event straight away.</p>
          </details>

          <div class="field" style="border-top: 2px solid var(--border); padding-top: 1rem;">
            <label for="submitter_contact">Your contact details (optional)</label>
            <input type="text" id="submitter_contact" name="submitter_contact">
            <p class="muted">Optional. Only the site admin sees this. It is never published.</p>
          </div>

          <p class="muted">
            What you fill in above (except your contact details) is published on the site.
            Your contact details, if you give them, are seen only by the admin, so they can
            reach you about this listing. You can ask for anything to be removed later.
          </p>

          <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}"></div>

          <div class="actions">
            <button type="button" class="secondary" data-back>Back</button>
            <button type="submit">Put it on the wall</button>
          </div>
          <p data-submit-status role="status"></p>
        </fieldset>
      </div>

      <noscript>
        <style>
          .form-step { position: static !important; visibility: visible !important; pointer-events: auto !important; }
          .step-progress, .form-step .actions { display: none !important; }
        </style>
        <p class="error">This form needs JavaScript, since it checks you are not a robot.</p>
      </noscript>
    </form>
  `;
}

/**
 * The confirmation page shown once, section 9.2. JavaScript reads the edit
 * token from the URL fragment so it never reaches the server.
 */
export function submitConfirmationPage() {
  return html`
    <h1>On the wall</h1>
    <p>Thanks. Your event is in the queue for the admin to check.</p>
    <div data-edit-link-holder hidden>
      <p><strong>Save this link. It is the only way to change or cancel your listing.</strong></p>
      <p>Anyone with the link can suggest changes, so do not post it publicly.</p>
      <p><input type="text" readonly data-edit-link-value style="width: 100%;"></p>
      <button type="button" data-copy-edit-link>Copy link</button>
      <p data-copy-status role="status"></p>
    </div>
    <noscript><p class="error">Your private edit link could not be shown because JavaScript is off. Please contact the admin if you need to change this listing.</p></noscript>
  `;
}
