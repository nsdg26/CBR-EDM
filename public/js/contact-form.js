(function () {
  var form = document.querySelector('[data-contact-form]');
  if (!form) return;

  var status = form.querySelector('[data-contact-status]');
  var submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var turnstileToken = form.querySelector('[name="cf-turnstile-response"]');
    if (!turnstileToken || !turnstileToken.value) {
      status.textContent = 'Please complete the check above first.';
      return;
    }

    submitButton.disabled = true;
    status.textContent = 'Sending...';

    fetch(form.action, { method: 'POST', body: new FormData(form) })
      .then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok || !result.data.ok) {
          status.textContent = (result.data && result.data.error) || 'Something went wrong. Try again.';
          submitButton.disabled = false;
          if (window.turnstile) window.turnstile.reset();
          return;
        }
        window.location.href = '/contact/sent';
      })
      .catch(function () {
        // Same fix as submit-form.js: without resetting here too, a
        // network hiccup leaves the single-use Turnstile token stale in
        // the hidden field, so the next click resends it and gets
        // rejected as a duplicate ("that check did not pass") even
        // though nothing about the check itself was wrong.
        status.textContent = 'Something went wrong. Try again.';
        submitButton.disabled = false;
        if (window.turnstile) window.turnstile.reset();
      });
  });
})();
