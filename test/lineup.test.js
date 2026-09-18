import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLineupText, actsWithHeadliners, serializeLineupLine, splitNote, joinNote } from '../src/lib/lineup.js';

test('parseLineupText treats a bare lineup as legacy, no headliner flagged', () => {
  const acts = parseLineupText('Deep Signal\nSupport Act');
  assert.deepEqual(acts, [
    { name: 'Deep Signal', note: null, headliner: false },
    { name: 'Support Act', note: null, headliner: false },
  ]);
});

test('parseLineupText reads name, note and headliner from the new pipe format', () => {
  const acts = parseLineupText('Deep Signal | Techno, 9pm | headliner\nSupport Act | ');
  assert.deepEqual(acts, [
    { name: 'Deep Signal', note: 'Techno, 9pm', headliner: true },
    { name: 'Support Act', note: null, headliner: false },
  ]);
});

test('parseLineupText returns an empty array for no lineup', () => {
  assert.deepEqual(parseLineupText(null), []);
  assert.deepEqual(parseLineupText(''), []);
});

test('actsWithHeadliners falls back to first-act-is-headliner for a legacy lineup', () => {
  const acts = actsWithHeadliners('Deep Signal\nSupport Act\nAnother Act');
  assert.equal(acts[0].headliner, true);
  assert.equal(acts[1].headliner, false);
  assert.equal(acts[2].headliner, false);
});

test('actsWithHeadliners respects a legacy equal-billing flag: nobody is the headliner', () => {
  const acts = actsWithHeadliners('Deep Signal\nSupport Act', 1);
  assert.equal(acts.every((act) => !act.headliner), true);
});

test('actsWithHeadliners uses exactly the flags marked in a new-format lineup, in submitted order', () => {
  const acts = actsWithHeadliners('Support Act | | \nDeep Signal | | headliner');
  assert.equal(acts[0].name, 'Support Act');
  assert.equal(acts[0].headliner, false);
  assert.equal(acts[1].name, 'Deep Signal');
  assert.equal(acts[1].headliner, true);
});

test('actsWithHeadliners reads a new-format lineup with no headliner checked as nobody headlining (equal billing), not the legacy first-act fallback', () => {
  const acts = actsWithHeadliners('Act A | \nAct B | ');
  assert.equal(acts.every((act) => !act.headliner), true);
});

test('serializeLineupLine round-trips through parseLineupText', () => {
  const line = serializeLineupLine({ name: 'Deep Signal', note: 'Techno, 9pm', headliner: true });
  assert.deepEqual(parseLineupText(line)[0], { name: 'Deep Signal', note: 'Techno, 9pm', headliner: true });
});

test('serializeLineupLine with no note or headliner still marks new format (a trailing pipe)', () => {
  const line = serializeLineupLine({ name: 'Deep Signal' });
  assert.ok(line.includes('|'));
  assert.deepEqual(parseLineupText(line)[0], { name: 'Deep Signal', note: null, headliner: false });
});

test('joinNote and splitNote round-trip genre and set time', () => {
  const note = joinNote('Techno', '9pm-10pm');
  assert.deepEqual(splitNote(note), { genre: 'Techno', time: '9pm-10pm' });
});

test('joinNote with only a genre or only a time omits the separator', () => {
  assert.equal(joinNote('Techno', ''), 'Techno');
  assert.equal(joinNote('', '9pm'), '9pm');
  assert.equal(joinNote('', ''), '');
});

test('splitNote puts a legacy freeform note (no separator) entirely in genre, never dropping it', () => {
  assert.deepEqual(splitNote('back to back with Support Act'), { genre: 'back to back with Support Act', time: '' });
  assert.deepEqual(splitNote(null), { genre: '', time: '' });
});
