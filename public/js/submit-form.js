// Public submission form behaviour, section 9.1.
(function () {
  var form = document.querySelector('[data-submit-form]');
  if (form) {
    var steps = Array.prototype.slice.call(form.querySelectorAll('.form-step'));
    var stepCurrentEl = form.querySelector('[data-step-current]');
    var currentStepIndex = 0;

    function showStep(index) {
      currentStepIndex = index;
      steps.forEach(function (step, i) {
        step.classList.toggle('is-active', i === index);
      });
      if (stepCurrentEl) stepCurrentEl.textContent = String(index + 1);

      // Moves focus (and so the screen reader's attention) to the new
      // step, since nothing else on the page otherwise indicates the step
      // changed. h2 isn't focusable by default, hence the tabindex.
      var heading = steps[index].querySelector('h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }

    // Section 9.1 rework: individual DJ rows (name, an optional inline
    // genre/set-time note, and a headliner checkbox) replace the old
    // single "one act per line" textarea and the separate equal-billing
    // checkbox. Serialised into the hidden `lineup` field as one line per
    // row, "name | note | headliner" -- see src/lib/lineup.js, which parses
    // exactly this format server-side, and keeps the wire format a plain
    // text column so nothing else about how the field posts has to change.
    var lineupRowsContainer = form.querySelector('[data-lineup-rows]');
    var lineupRowTemplate = form.querySelector('[data-lineup-row-template]');
    var lineupValueInput = form.querySelector('[data-lineup-value]');
    var addDjButton = form.querySelector('[data-add-dj]');

    function addLineupRow() {
      if (!lineupRowTemplate || !lineupRowsContainer) return;
      var row = lineupRowTemplate.content.firstElementChild.cloneNode(true);
      var removeButton = row.querySelector('[data-remove-dj]');
      if (removeButton) {
        removeButton.addEventListener('click', function () {
          row.remove();
          serializeLineup();
        });
      }
      lineupRowsContainer.appendChild(row);
      return row;
    }

    function serializeLineup() {
      if (!lineupRowsContainer || !lineupValueInput) return;
      var rows = Array.prototype.slice.call(lineupRowsContainer.querySelectorAll('[data-lineup-row]'));
      var lines = rows.map(function (row) {
        var name = row.querySelector('[data-lineup-name]').value.trim();
        if (!name) return null;
        var note = row.querySelector('[data-lineup-note]').value.trim();
        var headliner = row.querySelector('[data-lineup-headliner]').checked;
        var line = name + ' | ' + note;
        if (headliner) line += ' | headliner';
        return line;
      }).filter(Boolean);
      lineupValueInput.value = lines.join('\n');
    }

    if (lineupRowsContainer) {
      addLineupRow();
      lineupRowsContainer.addEventListener('input', serializeLineup);
      lineupRowsContainer.addEventListener('change', serializeLineup);
    }

    if (addDjButton) {
      addDjButton.addEventListener('click', function () {
        var row = addLineupRow();
        if (row) {
          var nameField = row.querySelector('[data-lineup-name]');
          if (nameField) nameField.focus();
        }
      });
    }

    // Section 9.1 rework: a venue address gets checked against a real
    // place (the same geocoder the flyer's real terrain already used, see
    // src/lib/geocode.js) before moving past this step, rather than only
    // silently affecting the flyer later. Skipped entirely when Location
    // TBA is ticked, or when no address was given at all -- nothing here
    // is required.
    var venueCheckStatus = form.querySelector('[data-venue-check-status]');
    var venueAddressField = form.querySelector('#venue_address');
    var venueNameField = form.querySelector('#venue_name');
    var tbaToggle = form.querySelector('[data-tba-toggle]');
    var tbaFields = form.querySelector('[data-tba-fields]');

    async function checkVenueBeforeAdvance() {
      if (!venueAddressField) return true;
      if (tbaToggle && tbaToggle.checked) return true;
      var address = venueAddressField.value.trim();
      var name = venueNameField ? venueNameField.value.trim() : '';
      if (!address && !name) return true;

      if (venueCheckStatus) venueCheckStatus.textContent = 'Checking that address...';
      try {
        var response = await fetch('/api/venue-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venue_name: name, venue_address: address, location_tba: false }),
        });
        var result = await response.json();

        if (result.skipped || result.ok) {
          if (venueCheckStatus) venueCheckStatus.textContent = '';
          return true;
        }

        if (venueCheckStatus) {
          venueCheckStatus.textContent = "We couldn't find that address. Check it, or tick Location TBA if it's not locked in yet.";
        }
        return false;
      } catch (err) {
        // A network hiccup here shouldn't trap someone on this step --
        // the same check runs again, authoritatively, on final submit.
        if (venueCheckStatus) venueCheckStatus.textContent = '';
        return true;
      }
    }

    steps.forEach(function (step, index) {
      var nextButton = step.querySelector('[data-next]');
      var backButton = step.querySelector('[data-back]');

      if (nextButton) {
        nextButton.addEventListener('click', function () {
          var fields = step.querySelectorAll('input, textarea, select');
          for (var i = 0; i < fields.length; i++) {
            if (!fields[i].checkValidity()) {
              fields[i].reportValidity();
              return;
            }
          }

          if (step.contains(venueAddressField)) {
            nextButton.disabled = true;
            checkVenueBeforeAdvance().then(function (ok) {
              nextButton.disabled = false;
              if (ok) showStep(index + 1);
            });
            return;
          }

          if (lineupRowsContainer && step.contains(lineupRowsContainer)) serializeLineup();
          showStep(index + 1);
        });
      }

      if (backButton) {
        backButton.addEventListener('click', function () {
          showStep(index - 1);
        });
      }
    });

    // Enter, in a text input, would otherwise submit the form via whichever
    // submit button it finds -- the one on the last step, wherever the user
    // actually is. Treat it as "next" instead, unless already on the last step.
    form.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || event.target.tagName === 'TEXTAREA') return;
      if (currentStepIndex === steps.length - 1) return;
      event.preventDefault();
      var nextButton = steps[currentStepIndex].querySelector('[data-next]');
      if (nextButton) nextButton.click();
    });

    if (tbaToggle && tbaFields) {
      tbaToggle.addEventListener('change', function () {
        tbaFields.hidden = !tbaToggle.checked;
      });
    }

    var status = form.querySelector('[data-submit-status]');
    var submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      var turnstileToken = form.querySelector('[name="cf-turnstile-response"]');
      if (!turnstileToken || !turnstileToken.value) {
        status.textContent = 'Please complete the check above first.';
        return;
      }

      serializeLineup();

      submitButton.disabled = true;
      status.textContent = 'Sending...';

      try {
        var body = new FormData(form);
        var response = await fetch(form.action, { method: 'POST', body: body });
        var result = await response.json();

        if (!response.ok || !result.ok) {
          status.textContent = result.error || 'Something went wrong. Try again.';
          submitButton.disabled = false;
          if (window.turnstile) window.turnstile.reset();
          return;
        }

        window.location.href = '/submit/confirmation#' + encodeURIComponent(result.editToken || '');
      } catch (err) {
        // A Turnstile token is single-use -- without resetting here too
        // (the other failure branch above already does), a network
        // hiccup on this attempt leaves the same now-stale token in the
        // hidden field, so the next click resends it and gets rejected
        // as a duplicate ("that check did not pass") even though nothing
        // about the check itself was wrong.
        status.textContent = 'Something went wrong. Try again.';
        submitButton.disabled = false;
        if (window.turnstile) window.turnstile.reset();
      }
    });
  }

  var confirmationHolder = document.querySelector('[data-edit-link-holder]');
  if (confirmationHolder) {
    var token = window.location.hash.slice(1);
    if (token) {
      var input = confirmationHolder.querySelector('[data-edit-link-value]');
      input.value = window.location.origin + '/edit#' + token;
      confirmationHolder.hidden = false;

      var copyButton = confirmationHolder.querySelector('[data-copy-edit-link]');
      var copyStatus = confirmationHolder.querySelector('[data-copy-status]');
      copyButton.addEventListener('click', async function () {
        try {
          await navigator.clipboard.writeText(input.value);
          copyStatus.textContent = 'Copied.';
        } catch (err) {
          input.select();
          copyStatus.textContent = 'Could not copy automatically. Select and copy the text above.';
        }
      });
    }
  }
})();
