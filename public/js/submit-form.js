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

    // Section 9.1 rework: individual DJ rows (name, set time, genre and a
    // headliner checkbox) replace the old single "one act per line"
    // textarea, the separate equal-billing checkbox and the standalone
    // event-wide Genre field -- see public/js/lineup-rows.js, shared with
    // the admin and public edit-your-listing forms so all three behave
    // identically.
    var lineupRowsContainer = form.querySelector('[data-lineup-rows]');
    var lineup = lineupRowsContainer && window.CbrLineupRows.init({
      container: lineupRowsContainer,
      template: form.querySelector('[data-lineup-row-template]'),
      lineupInput: form.querySelector('[data-lineup-value]'),
      genresInput: form.querySelector('[data-genres-value]'),
      addButton: form.querySelector('[data-add-dj]'),
    });

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

          if (lineup && step.contains(lineupRowsContainer)) lineup.serializeNow();
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

      if (lineup) lineup.serializeNow();

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
