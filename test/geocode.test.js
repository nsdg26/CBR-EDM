import assert from 'node:assert/strict';
import { test } from 'node:test';
import { geocodeVenue, fetchElevationGrid, fetchRealTerrain, venueNotFoundMessage } from '../src/lib/geocode.js';

function withFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return fn().finally(() => {
    global.fetch = original;
  });
}

test('geocodeVenue returns lat/lng from the first Nominatim result', async () => {
  await withFetch(async (url) => {
    assert.ok(String(url).includes('nominatim.openstreetmap.org'));
    return { ok: true, json: async () => [{ lat: '-35.30', lon: '149.12' }] };
  }, async () => {
    const result = await geocodeVenue('Sideway', '1 Lonsdale St, Braddon');
    assert.deepEqual(result, { lat: -35.3, lng: 149.12 });
  });
});

test('geocodeVenue returns null with no query text', async () => {
  const result = await geocodeVenue(null, null);
  assert.equal(result, null);
});

test('geocodeVenue returns null on a failed response', async () => {
  await withFetch(async () => ({ ok: false }), async () => {
    const result = await geocodeVenue('Sideway', null);
    assert.equal(result, null);
  });
});

test('geocodeVenue returns null on a network error, never throws', async () => {
  await withFetch(async () => { throw new Error('network down'); }, async () => {
    const result = await geocodeVenue('Sideway', null);
    assert.equal(result, null);
  });
});

test('geocodeVenue returns null when no results are found', async () => {
  await withFetch(async () => ({ ok: true, json: async () => [] }), async () => {
    const result = await geocodeVenue('Nonexistent Place', null);
    assert.equal(result, null);
  });
});

test('geocodeVenue rejects a match too coarse to be a real venue (a made-up address falling back to "the city")', async () => {
  // A bogus address often still returns *something* from Nominatim's
  // free-text search -- the city or region it fell back to -- rather
  // than an empty result. place_rank 15 is city-level, nowhere near a
  // specific venue, so this must not be treated as a genuine geocode.
  await withFetch(async () => ({
    ok: true,
    json: async () => [{ lat: '-35.30', lon: '149.13', place_rank: 15, addresstype: 'city' }],
  }), async () => {
    const result = await geocodeVenue('asdkfjasdlkfj', null);
    assert.equal(result, null);
  });
});

test('geocodeVenue accepts a street/building-level match', async () => {
  await withFetch(async () => ({
    ok: true,
    json: async () => [{ lat: '-35.30', lon: '149.13', place_rank: 30, addresstype: 'shop' }],
  }), async () => {
    const result = await geocodeVenue('Sideway', '1 Lonsdale St, Braddon');
    assert.deepEqual(result, { lat: -35.3, lng: 149.13 });
  });
});

test('fetchElevationGrid builds a north-up grid: row 0 is north of row 8', async () => {
  // contour.js's toScreen maps row -> y directly (row 0 at the top of the
  // canvas), so row 0 must be the grid's north edge -- a real bug found
  // by checking a rendered flyer against the real geocoded location,
  // where south was rendering at the top.
  let firstRowLat = null;
  let lastRowLat = null;
  await withFetch(async (url) => {
    const points = new URL(url).searchParams.get('locations').split('|');
    firstRowLat = Number(points[0].split(',')[0]);
    lastRowLat = Number(points[points.length - 1].split(',')[0]);
    return { ok: true, json: async () => ({ status: 'OK', results: points.map(() => ({ elevation: 580 })) }) };
  }, async () => {
    await fetchElevationGrid(-35.3, 149.12);
  });
  assert.ok(firstRowLat > lastRowLat, `row 0 (lat ${firstRowLat}) should be north of row 8 (lat ${lastRowLat})`);
});

test('fetchElevationGrid requests a 9x9 grid and returns the flat values', async () => {
  await withFetch(async (url) => {
    const locations = new URL(url).searchParams.get('locations');
    const points = locations.split('|');
    assert.equal(points.length, 81);
    return {
      ok: true,
      json: async () => ({ status: 'OK', results: points.map(() => ({ elevation: 580 })) }),
    };
  }, async () => {
    const grid = await fetchElevationGrid(-35.3, 149.12);
    assert.equal(grid.size, 9);
    assert.equal(grid.values.length, 81);
    assert.ok(grid.values.every((v) => v === 580));
  });
});

test('fetchElevationGrid returns null if the API reports a non-OK status', async () => {
  await withFetch(async () => ({ ok: true, json: async () => ({ status: 'INVALID_REQUEST' }) }), async () => {
    const grid = await fetchElevationGrid(-35.3, 149.12);
    assert.equal(grid, null);
  });
});

test('fetchElevationGrid returns null if any elevation is missing', async () => {
  await withFetch(async (url) => {
    const points = new URL(url).searchParams.get('locations').split('|');
    return {
      ok: true,
      json: async () => ({ status: 'OK', results: points.map((_, i) => ({ elevation: i === 5 ? null : 500 })) }),
    };
  }, async () => {
    const grid = await fetchElevationGrid(-35.3, 149.12);
    assert.equal(grid, null);
  });
});

test('fetchRealTerrain returns null if geocoding fails, without attempting elevation', async () => {
  let elevationCalled = false;
  await withFetch(async (url) => {
    if (String(url).includes('opentopodata')) elevationCalled = true;
    return { ok: true, json: async () => [] };
  }, async () => {
    const result = await fetchRealTerrain('Nowhere', null);
    assert.equal(result, null);
    assert.equal(elevationCalled, false);
  });
});

test('venueNotFoundMessage nudges toward a street address when none was given', () => {
  assert.match(venueNotFoundMessage({ venue_address: null }), /don't know that venue.*street address/);
  assert.match(venueNotFoundMessage({ venue_address: '' }), /don't know that venue.*street address/);
});

test('venueNotFoundMessage nudges to check the address when one was given', () => {
  assert.match(venueNotFoundMessage({ venue_address: '1 Lonsdale St, Braddon' }), /couldn't find that venue address.*Check it/);
});

test('fetchRealTerrain combines geocoding and elevation', async () => {
  await withFetch(async (url) => {
    if (String(url).includes('nominatim')) {
      return { ok: true, json: async () => [{ lat: '-35.30', lon: '149.12' }] };
    }
    const points = new URL(url).searchParams.get('locations').split('|');
    return { ok: true, json: async () => ({ status: 'OK', results: points.map(() => ({ elevation: 600 })) }) };
  }, async () => {
    const result = await fetchRealTerrain('Sideway', '1 Lonsdale St, Braddon');
    assert.equal(result.lat, -35.3);
    assert.equal(result.lng, 149.12);
    assert.equal(result.grid.values.length, 81);
  });
});
