// Admin add/edit event form, section 9.1 rework: same DJ-row behaviour as
// the public submit and edit-your-listing forms (see public/js/lineup-rows.js),
// but the rows here are already server-rendered with the event's existing
// lineup (see renderLineupRows in src/templates/lineupRow.js) rather than
// hydrated from a fetch, since this is a plain server-rendered form.
(function () {
  var container = document.querySelector('[data-lineup-rows]');
  if (!container || !window.CbrLineupRows) return;

  window.CbrLineupRows.init({
    container: container,
    template: document.querySelector('[data-lineup-row-template]'),
    lineupInput: document.querySelector('[data-lineup-value]'),
    genresInput: document.querySelector('[data-genres-value]'),
    addButton: document.querySelector('[data-add-dj]'),
  });
})();
