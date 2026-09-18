// Shared DJ-row behaviour, section 9.1 rework: add/remove a row and keep
// the hidden `lineup`/`genres` inputs in sync, used by the public submit
// form, the public edit-your-listing form and the admin event form so all
// three behave identically. public/js has no build step to share code with
// src/lib, so the note-splitting logic below is a hand-kept mirror of
// splitNote/joinNote in src/lib/lineup.js -- keep them in sync.
(function () {
  var NOTE_PART_SEPARATOR = ' · ';

  function splitNote(note) {
    var trimmed = (note || '').trim();
    if (!trimmed) return { genre: '', time: '' };
    var idx = trimmed.indexOf(NOTE_PART_SEPARATOR);
    if (idx === -1) return { genre: trimmed, time: '' };
    return { genre: trimmed.slice(0, idx).trim(), time: trimmed.slice(idx + NOTE_PART_SEPARATOR.length).trim() };
  }

  function joinNote(genre, time) {
    var g = (genre || '').trim();
    var t = (time || '').trim();
    if (g && t) return g + NOTE_PART_SEPARATOR + t;
    return g || t;
  }

  /**
   * Mirrors parseLineupText in src/lib/lineup.js. Only needed to hydrate
   * DJ rows from lineup text fetched as data (the public edit-your-listing
   * form) -- the admin form gets its rows server-rendered instead, and
   * submit never has existing data to parse.
   */
  function parseLineupText(lineup) {
    if (!lineup) return [];
    var rawLines = lineup.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
    var isNewFormat = rawLines.some(function (line) { return line.indexOf('|') !== -1; });
    if (!isNewFormat) return rawLines.map(function (name) { return { name: name, note: null, headliner: false }; });
    return rawLines.map(function (line) {
      var parts = line.split('|').map(function (part) { return part.trim(); });
      var headliner = parts.length > 2 && parts[parts.length - 1].toLowerCase() === 'headliner';
      var noteParts = headliner ? parts.slice(1, -1) : parts.slice(1);
      var note = noteParts.join(' | ').trim() || null;
      return { name: parts[0], note: note, headliner: headliner };
    });
  }

  /**
   * @param {Element} container - [data-lineup-rows]
   * @param {HTMLTemplateElement} template - [data-lineup-row-template]
   * @param {{ name?: string, note?: string, headliner?: boolean }} [act]
   */
  function addRow(container, template, act) {
    if (!container || !template) return null;
    var row = template.content.firstElementChild.cloneNode(true);

    if (act) {
      var split = splitNote(act.note);
      row.querySelector('[data-lineup-name]').value = act.name || '';
      row.querySelector('[data-lineup-genre]').value = split.genre;
      row.querySelector('[data-lineup-time]').value = split.time;
      row.querySelector('[data-lineup-headliner]').checked = Boolean(act.headliner);
    }

    var removeButton = row.querySelector('[data-remove-dj]');
    if (removeButton) {
      removeButton.addEventListener('click', function () {
        row.remove();
        container.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    container.appendChild(row);
    return row;
  }

  /**
   * Rebuilds the hidden `lineup` value from the current rows. Also rebuilds
   * `genres` from whichever rows have a genre filled in -- but only
   * touches it when at least one does, so an event's existing genres value
   * (seeded server-side, see lineupField() in src/templates/lineupRow.js)
   * survives edits to rows that never touch genre, rather than getting
   * silently blanked out.
   * @param {Element} container
   * @param {HTMLInputElement} lineupInput
   * @param {HTMLInputElement} [genresInput]
   */
  function serialize(container, lineupInput, genresInput) {
    if (!container || !lineupInput) return;
    var rows = Array.prototype.slice.call(container.querySelectorAll('[data-lineup-row]'));
    var genreValues = [];

    var lines = rows.map(function (row) {
      var name = row.querySelector('[data-lineup-name]').value.trim();
      if (!name) return null;
      var genre = row.querySelector('[data-lineup-genre]').value.trim();
      var time = row.querySelector('[data-lineup-time]').value.trim();
      var headliner = row.querySelector('[data-lineup-headliner]').checked;
      if (genre) genreValues.push(genre);

      var line = name + ' | ' + joinNote(genre, time);
      if (headliner) line += ' | headliner';
      return line;
    }).filter(Boolean);

    lineupInput.value = lines.join('\n');

    if (genresInput && genreValues.length) {
      var unique = genreValues.filter(function (genre, i) { return genreValues.indexOf(genre) === i; });
      genresInput.value = unique.join(', ');
    }
  }

  /**
   * Wires up a Lineup field: add/remove rows, keep hidden inputs in sync,
   * and start with either the given acts (parsed from existing data) or,
   * failing that, one empty row -- there's always at least one row to
   * fill in, on every page that has this field.
   * @param {{ container: Element, template: HTMLTemplateElement, lineupInput: HTMLInputElement,
   *   genresInput?: HTMLInputElement, addButton?: Element, initialActs?: object[] }} options
   * @returns {{ addRow: (act?: object) => Element, serializeNow: () => void }}
   */
  function init(options) {
    var container = options.container;
    var template = options.template;

    function serializeNow() {
      serialize(container, options.lineupInput, options.genresInput);
    }

    if (options.addButton) {
      options.addButton.addEventListener('click', function () {
        var row = addRow(container, template);
        serializeNow();
        var nameField = row && row.querySelector('[data-lineup-name]');
        if (nameField) nameField.focus();
      });
    }

    container.addEventListener('input', serializeNow);
    container.addEventListener('change', serializeNow);

    // Seeded before the first serialize pass below, not after, so that
    // pass's own "leave genresInput alone if no row has a genre" rule
    // (see serialize() above) is what decides whether this seed survives
    // -- not a second assignment stomping on whatever serialize just did.
    if (options.genresInput && options.initialGenres !== undefined) {
      options.genresInput.value = options.initialGenres || '';
    }

    (options.initialActs || []).forEach(function (act) { addRow(container, template, act); });
    if (!container.querySelector('[data-lineup-row]')) addRow(container, template);
    serializeNow();

    return {
      addRow: function (act) { var row = addRow(container, template, act); serializeNow(); return row; },
      serializeNow: serializeNow,
    };
  }

  window.CbrLineupRows = { init: init, parseLineupText: parseLineupText };
})();
