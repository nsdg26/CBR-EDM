// Real-world terrain for the contour flyer template, owner request:
// "as close as realistically possible" for a disclosed venue, geocoded
// once (an explicit admin/crew action) rather than fetched live at
// render time, since flyer rendering must stay synchronous and
// deterministic. Never called for a location_tba event -- section 7's
// own rule for this template ("a real coordinate for a location-TBA
// event would be an actual problem, not just a design one") still holds.
//
// Geocoding: Nominatim (OpenStreetMap), free, no key, usage-policy
// compliant at this project's scale (one lookup per explicit action).
// Elevation: OpenTopoData's public srtm30m endpoint (SRTM, ~30m
// resolution), free, no key, single batched request per lookup.

const GRID_SIZE = 9;
const GRID_SPACING_METERS = 150;
const METERS_PER_DEGREE_LAT = 111320;

const USER_AGENT = 'CBR-EDM/1.0 (community EDM noticeboard; contact via cbredm.org)';

// Roughly Canberra plus enough surrounding region for a legitimate bush
// doof site, not so wide it lets an unrelated word match drift interstate
// (bounded=1 makes Nominatim actually enforce it, not just prefer it).
const CANBERRA_VIEWBOX = '148.65,-35.05,149.45,-35.55';

// Nominatim's place_rank, lower is coarser: 2 country, 4 state, 8-12
// region/county, ~15-16 city, 17 town, 18 village, 20 suburb, 26 road,
// 30 building/POI. A genuine venue address should resolve to something
// suburb-level or more specific -- a fake or nonsense address that
// doesn't match anything real still often returns *something* this
// coarse (the city or a whole suburb/village), because free-text search
// falls back to whatever part of the query it could match rather than
// returning nothing, and "the middle of Canberra" is not a venue.
const MIN_SPECIFIC_PLACE_RANK = 20;

/**
 * @param {string|null} venueName
 * @param {string|null} venueAddress
 * @returns {Promise<{ lat: number, lng: number }|null>}
 */
export async function geocodeVenue(venueName, venueAddress) {
  const primary = venueAddress || venueName;
  if (!primary) return null;
  // Just the country, not "Canberra, ACT" -- CANBERRA_VIEWBOX already
  // covers the NSW region around Canberra (bush doof venues are often
  // just over the border), and forcing "ACT" into the query text
  // contradicts a genuine NSW address (e.g. "..., Bungendore, NSW,
  // Australia, Canberra, ACT, Australia"), which Nominatim then fails
  // to match at all -- a real, correctly-typed venue address would
  // wrongly come back as not found.
  const query = [primary, 'Australia'].join(', ');

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&bounded=1&viewbox=${CANBERRA_VIEWBOX}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const results = await response.json();
    const first = results[0];
    if (!first) return null;
    // Reject a match too coarse to be an actual venue (see
    // MIN_SPECIFIC_PLACE_RANK above) -- a bogus or made-up address
    // shouldn't quietly become "somewhere in Canberra", which would
    // then draw a confident-looking real contour map for a venue that
    // was never actually geocoded.
    if (typeof first.place_rank === 'number' && first.place_rank < MIN_SPECIFIC_PLACE_RANK) return null;

    return { lat: Number(first.lat), lng: Number(first.lon) };
  } catch {
    return null;
  }
}

/**
 * A GRID_SIZE x GRID_SIZE grid of real elevation samples centred on
 * (lat, lng), GRID_SPACING_METERS apart -- roughly a 1.2km square, real
 * but regional rather than a hyper-zoomed single point.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ size: number, spacingMeters: number, values: number[] }|null>}
 */
export async function fetchElevationGrid(lat, lng) {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const half = (GRID_SIZE - 1) / 2;

  // Row 0 is the grid's north edge, increasing row moves south -- the
  // standard raster/DEM convention, and the one contour.js's row-to-y
  // mapping assumes (row 0 at the top of the flyer). Getting this
  // backwards doesn't break anything mechanically, it just quietly
  // renders every real-terrain flyer with south at the top.
  const points = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const dLat = ((half - row) * GRID_SPACING_METERS) / METERS_PER_DEGREE_LAT;
      const dLng = ((col - half) * GRID_SPACING_METERS) / metersPerDegreeLng;
      points.push(`${(lat + dLat).toFixed(6)},${(lng + dLng).toFixed(6)}`);
    }
  }

  try {
    const url = `https://api.opentopodata.org/v1/srtm30m?locations=${points.join('|')}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const body = await response.json();
    if (body.status !== 'OK' || !Array.isArray(body.results) || body.results.length !== points.length) return null;

    const values = body.results.map((r) => r.elevation);
    if (values.some((v) => v === null || v === undefined || Number.isNaN(v))) return null;

    return { size: GRID_SIZE, spacingMeters: GRID_SPACING_METERS, values };
  } catch {
    return null;
  }
}

/**
 * Geocodes a venue and fetches its real elevation grid in one call.
 * Returns null (never throws) if either step fails -- the caller falls
 * back to the template's fully synthetic generation, same as any other
 * missing optional field.
 * @param {string|null} venueName
 * @param {string|null} venueAddress
 * @param {{ lat: number, lng: number }|null} [precomputedLocation] - skips
 *   geocoding when the caller already has a result, e.g. from
 *   checkVenueRealness having just validated the same address
 */
export async function fetchRealTerrain(venueName, venueAddress, precomputedLocation) {
  const location = precomputedLocation !== undefined ? precomputedLocation : await geocodeVenue(venueName, venueAddress);
  if (!location) return null;

  const grid = await fetchElevationGrid(location.lat, location.lng);
  if (!grid) return null;

  return { lat: location.lat, lng: location.lng, grid };
}

/**
 * Whether a submitted venue is a real, geocodable place, section 9.1: the
 * public submit and edit-your-listing forms reject a venue address that
 * doesn't resolve to anything (unless the location is TBA), reusing this
 * same geocoder rather than a separate address-validation service. Returns
 * `skip: true` when there's nothing to check (TBA, or no venue text at all
 * -- both already legitimate per section 9.1's "nothing is required"), so
 * the caller only has to act on `ok` when `skip` is false. When it does
 * check, `location` is handed back so the caller can pass it straight into
 * terrainFieldsFor and avoid geocoding the same address twice.
 * @param {{ location_tba: boolean|number, venue_name: string|null, venue_address: string|null }} fields
 */
export async function checkVenueRealness(fields) {
  if (fields.location_tba) return { skip: true };
  if (!fields.venue_name && !fields.venue_address) return { skip: true };

  const location = await geocodeVenue(fields.venue_name, fields.venue_address);
  return { skip: false, ok: Boolean(location), location };
}

/**
 * The message for a failed checkVenueRealness, tailored to whether a street
 * address was actually given: with no venue_address, "check it" is the
 * wrong nudge -- a bare venue name that Nominatim doesn't recognise (a
 * small or brand new place, unmapped rather than mistyped) is fixed by
 * adding a real address, not by re-checking the name. public/js/submit-form.js
 * mirrors this same branch client-side for the live step-2 check, since it
 * can't import this module.
 * @param {{ venue_address: string|null }} fields
 */
export function venueNotFoundMessage(fields) {
  return fields.venue_address
    ? "We couldn't find that venue address. Check it, or tick Location TBA if it's not locked in yet."
    : "We don't know that venue. Try adding a street address, or tick Location TBA if it's not locked in yet.";
}

/**
 * The venue_lat/venue_lng/elevation_grid columns to persist for a save,
 * called automatically on every event create/update rather than behind a
 * manual "Fetch real terrain" button (owner request: it should always be
 * fetching real terrain unless the address is TBA, in which case contour
 * draws its synthetic map instead -- never a real coordinate for a
 * location-TBA event, the same rule the template itself follows).
 *
 * Additive only: a skipped or failed fetch never erases previously
 * fetched terrain, so a transient network hiccup on an unrelated edit
 * (e.g. changing the ticket URL) doesn't regress a flyer that already
 * had real terrain -- it just tries again on the next save.
 * @param {{ location_tba: boolean|number, venue_name: string|null, venue_address: string|null }} fields
 * @param {{ venue_lat: number|null, venue_lng: number|null, elevation_grid: string|null }} [existing]
 * @param {{ lat: number, lng: number }|null} [precomputedLocation] - see fetchRealTerrain
 */
export async function terrainFieldsFor(fields, existing = {}, precomputedLocation) {
  const kept = {
    venue_lat: existing.venue_lat ?? null,
    venue_lng: existing.venue_lng ?? null,
    elevation_grid: existing.elevation_grid ?? null,
  };

  if (fields.location_tba) return { venue_lat: null, venue_lng: null, elevation_grid: null };
  if (!fields.venue_name && !fields.venue_address) return kept;

  const terrain = await fetchRealTerrain(fields.venue_name, fields.venue_address, precomputedLocation);
  if (!terrain) return kept;

  return { venue_lat: terrain.lat, venue_lng: terrain.lng, elevation_grid: JSON.stringify(terrain.grid) };
}
