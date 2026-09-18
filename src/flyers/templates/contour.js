// T-10 contour - Canberra topography. FLYER-ENGINE-SPEC.md section 7. A
// procedurally generated contour map by default -- an evocation of a
// map, not a map. When the event has a real, disclosed venue that's
// been geocoded (src/lib/geocode.js, an explicit admin/crew action, never
// run for a location_tba event), the lines are traced from that venue's
// actual elevation data instead (owner request). Failure mode to avoid:
// no real coordinates, elevations, or place data for a location-TBA
// event -- that would be an actual problem, not just a design one; see
// normalise.js's elevationGridFor, which enforces this regardless of
// what's in the database.

import { ticketFooter, TICKET_FOOTER_HEIGHT } from '../parts/ticketFooter.js';
import { measure } from '../metrics.js';
import { escapeXml } from '../xml.js';
import { range } from '../seed.js';

// Owner decision: the venue marker is always this triangle -- no longer
// picked per-render from triangle/cross/circle.
const triangleMarker = (x, y, s) => `M ${x.toFixed(1)} ${(y - s).toFixed(1)} L ${(x + s).toFixed(1)} ${(y + s).toFixed(1)} L ${(x - s).toFixed(1)} ${(y + s).toFixed(1)} Z`;

// Real elevation data is smooth at this grid's resolution (30m samples,
// 150m apart), so a contour level realistically crosses on the order of
// the grid's own size in cells, not anywhere near all of them -- this
// cap is a safety net against a pathological dataset, not the expected
// count. Lowered from 2400 (owner decision, 2026-09-14: contour is now
// the only template in the codebase, so render() has nothing left to
// silently fall back to if this template's own output blows the size
// budget -- a pathological checkerboard grid plus a long lineup used to
// land north of it at 2400, which the old medi fallback quietly papered
// over, the exact silent-substitution bug described below for a
// different cause). 1500 leaves real headroom for a long lineup even in
// that worst case; see test/flyers.test.js's checkerboard test.
const MAX_TERRAIN_SEGMENTS = 1500;
const MAP_OVERSCAN = 120;
// The geocoded grid is only 9x9 (real API points cost a request each);
// upsampling it before tracing is what makes the lines smooth curves
// instead of a blocky low-poly outline of the same real data, and lets
// more contour levels read as distinct lines rather than a solid mass.
const UPSAMPLE_FACTOR = 4;

// A full-detail real-terrain map (14-20 levels over a 33x33 upsampled
// grid) can land well north of the board/archive thumbnail's size budget
// once a full, untruncated lineup is added under the headliner too --
// bug the owner reported: same event, contour in the admin preview
// (surface 'page', a much bigger budget) but "Deep field" on the board,
// because contour's own SVG blew the thumbnail budget and render()'s
// crash-safety net silently substituted medi. Trimming detail for the
// scrap surface is the fix at the source, on top of raising that budget
// in index.js -- belt and braces, since a lineup can still be long.
function terrainDetailFor(surface) {
  if (surface === 'scrap') {
    return { upsampleFactor: 2, levelBase: 8, levelSpread: 4, maxSegments: 900 };
  }
  return { upsampleFactor: UPSAMPLE_FACTOR, levelBase: 14, levelSpread: 7, maxSegments: MAX_TERRAIN_SEGMENTS };
}

/**
 * Catmull-Rom cubic through four collinear samples (p1 to p2, p0 and p3
 * giving it a tangent to match), t in [0, 1]. Exact at t=0 (p1) and t=1
 * (p2) -- unlike bilinear, curves between samples instead of running
 * straight lines through them, which is what actually removes the
 * faceted look rather than just making the facets smaller.
 */
function catmullRom1D(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1
    + (p2 - p0) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (3 * p1 - p0 - 3 * p2 + p3) * t3
  );
}

/**
 * Bicubic (Catmull-Rom) upsample of a scalar grid to (size - 1) * factor
 * + 1 per side, same physical span and exact same centre point. Doesn't
 * invent data the samples don't support -- it's a standard way to
 * render a coarse DEM as smooth contours, curving between the real
 * values rather than a piecewise-linear approximation of them.
 * @param {{ size: number, values: number[] }} grid
 * @param {number} factor
 */
function upsampleGrid(grid, factor) {
  const { size, values } = grid;
  const newSize = (size - 1) * factor + 1;
  const at = (r, c) => values[Math.min(size - 1, Math.max(0, r)) * size + Math.min(size - 1, Math.max(0, c))];
  const newValues = new Array(newSize * newSize);

  for (let nr = 0; nr < newSize; nr++) {
    const fr = nr / factor;
    const r1 = Math.min(size - 2, Math.floor(fr));
    const tr = fr - r1;
    for (let nc = 0; nc < newSize; nc++) {
      const fc = nc / factor;
      const c1 = Math.min(size - 2, Math.floor(fc));
      const tc = fc - c1;

      const rowValues = [];
      for (let dr = -1; dr <= 2; dr++) {
        rowValues.push(catmullRom1D(at(r1 + dr, c1 - 1), at(r1 + dr, c1), at(r1 + dr, c1 + 1), at(r1 + dr, c1 + 2), tc));
      }
      newValues[nr * newSize + nc] = catmullRom1D(rowValues[0], rowValues[1], rowValues[2], rowValues[3], tr);
    }
  }
  return { size: newSize, values: newValues };
}

/**
 * One iso-elevation level's line segments through a scalar grid
 * (marching squares, the standard case table). Segments are left
 * unstitched -- adjacent cells' segments share exact interpolated
 * endpoints, so they still read as continuous lines once drawn together,
 * without needing a path-tracing pass.
 * @param {{ size: number, values: number[] }} grid
 * @param {number} threshold
 * @param {(cell: { r: number, c: number }) => { x: number, y: number }} toScreen
 * @param {number} budget - remaining segment budget across all levels
 */
function marchingSquaresSegments(grid, threshold, toScreen, budget) {
  const { size, values } = grid;
  const at = (r, c) => values[r * size + c];
  const lerp = (a, b) => (b === a ? 0.5 : (threshold - a) / (b - a));
  const segments = [];

  outer: for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const tl = at(r, c);
      const tr = at(r, c + 1);
      const bl = at(r + 1, c);
      const br = at(r + 1, c + 1);
      const caseIndex = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0)
        | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
      if (caseIndex === 0 || caseIndex === 15) continue;

      const top = toScreen({ r, c: c + lerp(tl, tr) });
      const bottom = toScreen({ r: r + 1, c: c + lerp(bl, br) });
      const left = toScreen({ r: r + lerp(tl, bl), c });
      const right = toScreen({ r: r + lerp(tr, br), c: c + 1 });

      const cases = {
        1: [[left, bottom]], 14: [[left, bottom]],
        2: [[bottom, right]], 13: [[bottom, right]],
        3: [[left, right]], 12: [[left, right]],
        4: [[top, right]], 11: [[top, right]],
        6: [[top, bottom]], 9: [[top, bottom]],
        7: [[left, top]], 8: [[left, top]],
        5: [[left, top], [bottom, right]],
        10: [[top, right], [left, bottom]],
      };
      for (const [a, b] of cases[caseIndex] || []) {
        segments.push([a, b]);
        if (segments.length >= budget) break outer;
      }
    }
  }
  return segments;
}

function segmentsToPath(segments) {
  return segments.map(([a, b]) => `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join(' ');
}

const TEXT_MASK_PADDING = 10;
// All-caps Archivo has no descenders, so the cap height alone (roughly
// 0.72em) is the actual ink -- this approximates that rather than using
// full font-metrics ascent/descent, which would pad the box well past
// the visible letterforms.
const CAP_HEIGHT_RATIO = 0.72;

/**
 * An opaque rect sized to the text it sits behind, plus a fixed minor
 * padding -- owner request: mask the contour lines under the title and
 * venue label for readability, but keep the box tight to the text
 * rather than a generic wide band.
 * @param {{ x: number, y: number, width: number, size: number, anchor: 'start'|'middle'|'end', color: string }} options
 */
function textMaskRect({ x, y, width, size, anchor, color }) {
  const boxWidth = width + TEXT_MASK_PADDING * 2;
  const boxHeight = size * CAP_HEIGHT_RATIO + TEXT_MASK_PADDING * 2;
  const left = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
  const boxX = left - TEXT_MASK_PADDING;
  const boxY = y - size * CAP_HEIGHT_RATIO - TEXT_MASK_PADDING;
  return `<rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxWidth.toFixed(1)}" height="${boxHeight.toFixed(1)}" fill="${color}"/>`;
}

/**
 * Greedy line-packer for a list of names, like layout.js's wrap() but
 * treating each name as one atomic token joined by a middle dot -- a
 * name is never split mid-word the way word-level wrapping would.
 * Owner request: contour is the only auto-routed template left, so every
 * act has to show, never truncated to "+N MORE" -- this is what lets a
 * long lineup spill onto more lines instead of being cut.
 * @param {string[]} names - already display-cased
 * @param {number} maxWidth
 * @param {{ font: string, size: number, letterSpacing?: number }} typeOptions
 */
function packNames(names, maxWidth, typeOptions) {
  const lines = [];
  let current = '';
  for (const name of names) {
    const candidate = current ? `${current}  ·  ${name}` : name;
    if (current && measure(candidate, typeOptions) > maxWidth) {
      lines.push(current);
      current = name;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Binary-search font size (mirrors layout.js's fitBlock) so a whole list
 * of names fits a box without ever dropping one -- at minSize, whatever
 * doesn't fit the box height is left to spill rather than lose a name,
 * since showing everyone is the point.
 * @param {string[]} names
 * @param {{ width: number, height: number }} box
 * @param {{ minSize: number, maxSize: number, font: string, leading: number, letterSpacingRatio?: number }} options
 */
function fitNamesBlock(names, box, options) {
  const { minSize, maxSize, font, leading, letterSpacingRatio = 0 } = options;

  function tryFit(size) {
    const typeOptions = { font, size, letterSpacing: size * letterSpacingRatio };
    const lines = packNames(names, box.width, typeOptions);
    const lineHeight = size * leading;
    const blockHeight = lines.length * lineHeight;
    const widestLine = Math.max(...lines.map((line) => measure(line, typeOptions)), 0);
    return { lines, lineHeight, blockHeight, widestLine };
  }

  let lo = minSize;
  let hi = maxSize;
  let best = { size: minSize, ...tryFit(minSize) };

  for (let i = 0; i < 8 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    const attempt = tryFit(mid);
    const fits = attempt.blockHeight <= box.height && attempt.widestLine <= box.width;
    if (fits) {
      best = { size: mid, ...attempt };
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return best;
}

/**
 * Pushes one centred, masked line of text and returns the y just past it
 * (for the next line's cursor). Shared by the title/presenter line, the
 * equal-billing block and the headliner's support-act lines below.
 */
function pushCenteredLine(parts, ctx, text, y, size, options = {}) {
  const { canvas, palette } = ctx;
  const { weight, letterSpacing = 0 } = options;
  const width = measure(text, { font: 'archivo', size, letterSpacing });
  parts.push(textMaskRect({ x: canvas.centerX, y, width, size, anchor: 'middle', color: palette.tonerBlack }));
  parts.push(`<text x="${canvas.centerX}" y="${y.toFixed(1)}" text-anchor="middle" font-family="'Archivo',Arial,sans-serif"${weight ? ` font-weight="${weight}"` : ''} font-size="${size}" letter-spacing="${letterSpacing / size || 0}em" fill="${palette.paper}">${escapeXml(text)}</text>`);
}

/**
 * The block of text above the map: an optional small title/presenter
 * line, then either one big line per headliner act plus every other act
 * wrapped underneath as support (no "+N MORE" -- contour is the only
 * template left, so everyone has to show), or, when no act is marked
 * headliner, every act at the same size and no emphasis at all -- section
 * 9.1's DJ-row headliner checkbox drives this directly now: leaving every
 * row unchecked reads as equal billing, so there's no separate control for
 * it any more. Returns the y just past the bottom of whatever it drew, so
 * the caller can keep the venue marker/label clear of it dynamically
 * instead of a fixed guess.
 */
function buildActsBlock(ctx, event) {
  const { canvas } = ctx;
  const parts = [];
  // The cursor tracks the next line's TOP edge, not its baseline -- text
  // sizes jump a lot in this block (20px title down to 56px headliner),
  // and a fixed baseline-to-baseline increment tuned for one size silently
  // overlaps at the next, which is exactly what happened here before this
  // was cap-height aware: the "Presented by" line collided with DEEP
  // SIGNAL because +16px wasn't enough clearance for 56px type. Deriving
  // the baseline from the top edge via CAP_HEIGHT_RATIO (same constant
  // textMaskRect uses) means each transition self-adjusts to whatever
  // size comes next.
  const lineGap = 12;
  let top = canvas.top + 40;

  function line(text, size, options = {}) {
    const baseline = top + size * CAP_HEIGHT_RATIO;
    pushCenteredLine(parts, ctx, text, baseline, size, options);
    top = baseline + TEXT_MASK_PADDING + lineGap;
  }

  // Owner ask: contour never showed the event's own title or its crew/
  // presenter name -- only ever event.headliner (the lineup's first
  // act). Skipped when it would just repeat the headliner (no lineup:
  // normalise.js falls back to event.title as the headliner itself).
  const smallLines = [];
  if (event.title && event.title.toUpperCase() !== (event.headliner || '').toUpperCase()) {
    smallLines.push(event.title);
  }
  if (event.presenter) smallLines.push(`Presented by ${event.presenter}`);

  const smallSize = 20;
  for (const smallLine of smallLines) {
    line(smallLine.toUpperCase(), smallSize, { letterSpacing: smallSize * 0.06 });
  }
  if (smallLines.length) top += 12;

  const headlinerActs = event.acts.filter((act) => act.headliner);

  if (headlinerActs.length === 0 && event.acts.length) {
    const names = event.acts.map((act) => act.name.toUpperCase());
    const fit = fitNamesBlock(names, { width: canvas.contentWidth, height: 460 }, {
      minSize: 24, maxSize: 52, font: 'archivo', leading: 1.25, letterSpacingRatio: 0.02,
    });
    for (const fitLine of fit.lines) {
      line(fitLine, fit.size, { weight: 800, letterSpacing: fit.size * 0.02 });
    }
    return { svg: parts.join(''), bottomY: top };
  }

  if (headlinerActs.length) {
    for (const act of headlinerActs) {
      line(act.name.toUpperCase(), 56, { weight: 800 });
    }
    top += 8;

    const support = event.acts.filter((act) => !act.headliner);
    if (support.length) {
      const names = support.map((act) => act.name.toUpperCase());
      // maxSize stays below smallSize (20, the title/"Presented by" line
      // above): a short support lineup with short names used to fit at
      // up to 22, making a support act's own name read bigger than the
      // event/crew name line -- found on a live flyer (DFPM's Dub.Sept).
      const fit = fitNamesBlock(names, { width: canvas.contentWidth, height: 380 }, {
        minSize: 16, maxSize: 19, font: 'archivo', leading: 1.6, letterSpacingRatio: 0.05,
      });
      for (const fitLine of fit.lines) {
        line(fitLine, fit.size, { letterSpacing: fit.size * 0.05 });
      }
    }
  }

  return { svg: parts.join(''), bottomY: top };
}

/**
 * Renders the real-elevation-derived version. Returns the same shape
 * the synthetic path uses: contourLines markup plus a marker screen
 * position (the grid's centre cell, which is exactly the geocoded venue).
 */
function renderRealTerrain(ctx, rawGrid) {
  const { canvas, palette, random, surface } = ctx;
  const detail = terrainDetailFor(surface);
  const grid = upsampleGrid(rawGrid, detail.upsampleFactor);
  const { size, values } = grid;
  const min = Math.min(...values);
  const max = Math.max(...values);

  // North-up: assumes row 0 is the grid's north edge (geocode.js's
  // fetchElevationGrid builds it that way), so increasing row moves
  // south and correctly moves down the canvas.
  const toScreen = ({ r, c }) => ({
    x: -MAP_OVERSCAN + (c / (size - 1)) * (canvas.width + 2 * MAP_OVERSCAN),
    y: -MAP_OVERSCAN + (r / (size - 1)) * (canvas.height + 2 * MAP_OVERSCAN),
  });

  const levelCount = detail.levelBase + Math.floor(random() * detail.levelSpread);

  // The highlighted contour is the one closest to the venue's own real
  // elevation (its exact grid centre value), not a random pick -- owner
  // request. Thresholds run min + 1*(max-min)/(levelCount+1) up to
  // min + levelCount*(max-min)/(levelCount+1), so inverting that for
  // venueElevation gives the closest index directly.
  const half = (size - 1) / 2;
  const venueElevation = values[half * size + half];
  const highlighted = max === min
    ? 0
    : Math.min(levelCount - 1, Math.max(0, Math.round(((venueElevation - min) / (max - min)) * (levelCount + 1)) - 1));

  let contourLines = '';
  let budget = detail.maxSegments;
  for (let i = 0; i < levelCount; i++) {
    const threshold = min + ((i + 1) * (max - min)) / (levelCount + 1);
    const segments = marchingSquaresSegments(grid, threshold, toScreen, budget);
    budget -= segments.length;
    const isHighlight = i === highlighted;
    const color = isHighlight ? palette.accent : palette.paper;
    const width = isHighlight ? 2.5 : 1;
    const opacity = isHighlight ? 1 : 0.35;
    contourLines += `<path d="${segmentsToPath(segments)}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
    if (budget <= 0) break;
  }

  const marker = toScreen({ r: half, c: half });

  // Which way the label should sit, so it reads outside the highlighted
  // line rather than crossing it where possible (owner feedback): moving
  // along the elevation gradient (not perpendicular to it) moves away
  // from the current contour band in either direction, since perpendicular
  // movement is what stays ON an isoline. Compares screen-space distance,
  // not raw grid deltas, since a row and a column don't cover the same
  // number of pixels here.
  const east = toScreen({ r: half, c: half + 1 });
  const south = toScreen({ r: half + 1, c: half });
  const dValueDx = (values[half * size + (half + 1)] - venueElevation) / (east.x - marker.x);
  const dValueDy = (values[(half + 1) * size + half] - venueElevation) / (south.y - marker.y);
  const labelDir = Math.abs(dValueDx) >= Math.abs(dValueDy)
    ? (dValueDx >= 0 ? 'right' : 'left')
    : (dValueDy >= 0 ? 'down' : 'up');

  return { contourLines, markerX: marker.x, markerY: marker.y, labelDir };
}

/** The original fully-synthetic version: seeded wobble rings around a seeded centre. */
function renderSyntheticTerrain(ctx) {
  const { canvas, palette, random, surface } = ctx;
  // Same thumbnail-budget reasoning as terrainDetailFor for real terrain
  // -- fewer, coarser rings on the scrap surface, well below what's
  // perceptible at a 200px-wide board card anyway.
  const isScrap = surface === 'scrap';
  const contourCount = (isScrap ? 6 : 8) + Math.floor(random() * (isScrap ? 3 : 5));
  const highlighted = Math.floor(random() * contourCount);
  const harmonics = [1 + Math.floor(random() * 3), 2 + Math.floor(random() * 3)];
  const amp = range(random, 40, 90);
  const phaseX = random() * Math.PI * 2;
  const phaseY = random() * Math.PI * 2;
  const cx = canvas.centerX + range(random, -100, 100);
  const cy = canvas.centerY + range(random, -100, 100);

  let contourLines = '';
  let markerX = cx;
  let markerY = cy;
  for (let c = 0; c < contourCount; c++) {
    const baseRadius = 120 + c * 90;
    const isHighlight = c === highlighted;
    let d = '';
    const samples = isScrap ? 40 : 72;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * Math.PI * 2;
      const wobble = amp * (Math.sin(t * harmonics[0] + phaseX) + Math.sin(t * harmonics[1] + phaseY)) / 2;
      const r = baseRadius + wobble;
      const x = cx + r * Math.cos(t);
      const y = cy + r * Math.sin(t);
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    const color = isHighlight ? palette.accent : palette.paper;
    const width = isHighlight ? 2.5 : 1;
    const opacity = isHighlight ? 1 : 0.35;
    contourLines += `<path d="${d}Z" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
    if (isHighlight) {
      const labelAngle = range(random, 0, Math.PI * 2);
      markerX = cx + baseRadius * Math.cos(labelAngle);
      markerY = cy + baseRadius * Math.sin(labelAngle);
    }
  }
  // No local gradient concept in the synthetic version -- keeps the
  // original placement, to the right of the marker.
  return { contourLines, markerX, markerY, labelDir: 'right' };
}

export default {
  id: 'contour',
  name: 'Contour map',
  blurb: 'Procedural topographic lines, real terrain when a venue is geocoded.',
  suits: ['outdoor', 'doof', 'bush', 'picnic'],
  minLineup: 0,
  maxLineup: 6,
  needs: [],
  render(ctx) {
    const { event, canvas, palette } = ctx;
    // The acts/title block is built first (rather than at its old fixed
    // headlinerY) so its actual measured height -- now that support acts
    // wrap to as many lines as a full lineup needs instead of being
    // truncated to "+N MORE" -- decides how much of the top of the
    // canvas the venue marker/label has to stay clear of, rather than a
    // fixed guess tuned for a one-line lineup.
    const actsBlock = buildActsBlock(ctx, event);
    const clearZoneBottom = Math.max(canvas.top + canvas.contentHeight / 3, actsBlock.bottomY + 20);
    // The marker's screen position (seeded ring position for the
    // synthetic map, the exact grid centre for a real one) is never
    // trusted to land in a safe spot on its own -- clamped clear of the
    // headliner zone, the footer band, and both side edges.
    const footerSafeBottom = canvas.bottom - TICKET_FOOTER_HEIGHT - 30;

    const parts = [];
    parts.push(`<rect x="0" y="0" width="${canvas.width}" height="${canvas.height}" fill="${palette.tonerBlack}"/>`);

    const { contourLines, markerX, markerY, labelDir } = event.elevationGrid
      ? renderRealTerrain(ctx, event.elevationGrid)
      : renderSyntheticTerrain(ctx);
    parts.push(`<g>${contourLines}</g>`);

    // Venue label, like a labelled spot height.
    const venueText = event.locationTba ? 'LOCATION TBA' : event.venueName;
    if (venueText) {
      const upperVenue = venueText.toUpperCase();
      // Halfway between the headliner's 56 and the label's old 18,
      // owner request: the venue name should read as more obvious.
      const venueSize = 37;
      const textWidth = measure(upperVenue, { font: 'archivo', size: venueSize, letterSpacing: venueSize * 0.1 });
      const markerToTextGap = 18;
      const edgeMargin = 24;

      // Which side of the marker the text sits on depends on labelDir
      // (owner feedback: keep it off the highlighted line where
      // possible) -- each direction needs its own text-anchor and its
      // own edge/zone clamp, since "past the edge" means something
      // different depending on which way the text runs.
      let lx;
      let ly2;
      let textAnchor = 'start';
      let textX;
      let textY;

      if (labelDir === 'left') {
        textAnchor = 'end';
        lx = Math.min(
          Math.max(markerX, canvas.left + edgeMargin + markerToTextGap + textWidth),
          canvas.right - edgeMargin,
        );
        ly2 = Math.min(Math.max(clearZoneBottom + 20, markerY), footerSafeBottom);
        textX = lx - markerToTextGap;
        textY = ly2 + venueSize * 0.35;
      } else if (labelDir === 'up' || labelDir === 'down') {
        textAnchor = 'middle';
        lx = Math.min(Math.max(markerX, canvas.left + edgeMargin + textWidth / 2), canvas.right - edgeMargin - textWidth / 2);
        if (labelDir === 'up') {
          ly2 = Math.min(Math.max(clearZoneBottom + 20 + markerToTextGap + venueSize, markerY), footerSafeBottom);
          textY = ly2 - markerToTextGap;
        } else {
          ly2 = Math.min(Math.max(clearZoneBottom + 20, markerY), footerSafeBottom - markerToTextGap - venueSize);
          textY = ly2 + markerToTextGap + venueSize * 0.8;
        }
        textX = lx;
      } else {
        lx = Math.min(
          Math.max(markerX, canvas.left + edgeMargin),
          canvas.right - edgeMargin - markerToTextGap - textWidth,
        );
        // The clamp keeps the marker clear of the footer band, but the
        // text sits venueSize * 0.35 below it, so the clamp needs the
        // same margin subtracted or a big enough font could still push
        // the label into the footer even though the marker looked clear.
        ly2 = Math.min(Math.max(clearZoneBottom + 20, markerY), footerSafeBottom - venueSize * 0.35);
        textX = lx + markerToTextGap;
        textY = ly2 + venueSize * 0.35;
      }

      const markerSize = 8;
      parts.push(`<path d="${triangleMarker(lx, ly2, markerSize)}" stroke="${palette.accent}" stroke-width="2" fill="${palette.accent}"/>`);
      parts.push(textMaskRect({ x: textX, y: textY, width: textWidth, size: venueSize, anchor: textAnchor, color: palette.tonerBlack }));
      parts.push(`<text x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="${textAnchor}" font-family="'Archivo',Arial,sans-serif" font-size="${venueSize}" letter-spacing="0.1em" fill="${palette.paper}">${escapeXml(upperVenue)}</text>`);
    }

    parts.push(actsBlock.svg);

    // ticketFooter centres "Look after each other" at the bottom
    // middle, and the date centred on the same line as doors/close and
    // 18+ (owner request).
    parts.push(ticketFooter(ctx, { date: event.dateLong }));

    return `<g>${parts.join('')}</g>`;
  },
};
