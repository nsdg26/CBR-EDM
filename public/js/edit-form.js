// Edit-link flow, section 9.2. The token lives only in the URL fragment
// and this script's own fetch bodies, never in a query string or as a
// normal form action, so it never appears in server logs or referrers.
(function () {
  var statusEl = document.querySelector('[data-edit-status]');
  var form = document.querySelector('[data-edit-form]');
  if (!statusEl || !form) return;

  var token = window.location.hash.slice(1);
  if (!token) {
    statusEl.textContent = 'No edit link found. Check you used the full link you were given.';
    return;
  }

  var reviewNote = form.querySelector('[data-edit-review-note]');
  var saveStatus = form.querySelector('[data-edit-save-status]');
  var actions = document.querySelector('[data-edit-actions]');
  var requestStatus = actions.querySelector('[data-request-status]');
  var isPublished = false;

  // The DJ-row lineup UI is hydrated separately below once the event
  // loads (see CbrLineupRows.init), and age_restriction is now a
  // checkbox plus a same-named hidden fallback (section 9.1 rework, see
  // ageRestrictionField in src/templates/lineupRow.js) -- form.elements
  // would return a RadioNodeList for that shared name, not a single
  // element, so it's set directly by id instead of through setField.
  function setField(name, value) {
    var el = form.elements.namedItem(name);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value || '';
  }

  var lineupRowsContainer = form.querySelector('[data-lineup-rows]');
  var ageRestrictionCheckbox = document.getElementById('age_restriction');

  fetch('/api/edit/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token }),
  })
    .then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok || !result.data.ok) {
        statusEl.textContent = result.data.error || 'Could not load this listing.';
        return;
      }

      var event = result.data.event;
      isPublished = event.visibility === 'published';
      reviewNote.hidden = !isPublished;

      ['title', 'presented_by', 'start_at_local', 'end_at_local', 'venue_name', 'venue_address',
        'location_reveal_at', 'location_how_to_find', 'ticket_url', 'notes']
        .forEach(function (name) { setField(name, event[name]); });
      setField('location_tba', event.location_tba);
      if (ageRestrictionCheckbox) ageRestrictionCheckbox.checked = event.age_restriction !== 'all_ages';

      if (lineupRowsContainer && window.CbrLineupRows) {
        window.CbrLineupRows.init({
          container: lineupRowsContainer,
          template: form.querySelector('[data-lineup-row-template]'),
          lineupInput: form.querySelector('[data-lineup-value]'),
          genresInput: form.querySelector('[data-genres-value]'),
          addButton: form.querySelector('[data-add-dj]'),
          initialActs: window.CbrLineupRows.parseLineupText(event.lineup),
          initialGenres: event.genres,
        });
      }

      statusEl.hidden = true;
      form.hidden = false;
      actions.hidden = false;
    })
    .catch(function () {
      statusEl.textContent = 'Could not load this listing. Check your connection and try again.';
    });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    saveStatus.textContent = 'Saving...';

    var body = new FormData(form);
    body.append('token', token);

    fetch('/api/edit/update', { method: 'POST', body: body })
      .then(function (response) { return response.json(); })
      .then(function (result) {
        if (!result.ok) {
          saveStatus.textContent = result.error || 'Could not save. Try again.';
          return;
        }
        saveStatus.textContent = result.applied === 'pending_review'
          ? 'Saved. Since this event is already published, an admin will review your changes before they go live.'
          : 'Saved.';
      })
      .catch(function () {
        saveStatus.textContent = 'Could not save. Try again.';
      });
  });

  actions.querySelectorAll('[data-request]').forEach(function (button) {
    button.addEventListener('click', function () {
      var kind = button.getAttribute('data-request');
      var reason = document.getElementById('reason').value;
      requestStatus.textContent = 'Sending...';

      fetch('/api/edit/' + kind, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, reason: reason }),
      })
        .then(function (response) { return response.json(); })
        .then(function (result) {
          requestStatus.textContent = result.ok
            ? 'Sent. The admin will review this ' + kind + ' request.'
            : (result.error || 'Could not send that request.');
        })
        .catch(function () {
          requestStatus.textContent = 'Could not send that request.';
        });
    });
  });
})();
