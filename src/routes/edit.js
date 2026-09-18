import { layout } from '../templates/layout.js';
import { editPage } from '../templates/edit.js';
import { hashToken } from '../lib/tokens.js';
import { readEventFields, validateEventFields } from '../lib/eventFields.js';
import { generateId } from '../lib/ids.js';
import { utcToCanberraLocalInput } from '../lib/dates.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { terrainFieldsFor, checkVenueRealness, venueNotFoundMessage } from '../lib/geocode.js';

const NO_JS_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

export async function handleEditPage(request, env) {
  const page = String(layout({ title: 'Edit your listing', bodyContent: editPage() }));
  return new Response(page, { headers: NO_JS_HEADERS });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

async function findEventByToken(env, token) {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  return env.DB.prepare('SELECT * FROM events WHERE edit_token_hash = ?').bind(tokenHash).first();
}

/**
 * POST /api/edit/load. Returns only what the edit form needs, never the
 * token hash or submitter contact.
 */
export async function handleEditLoad(request, env) {
  const allowed = await checkRateLimit(request, env, 'edit_load', 60);
  if (!allowed) return jsonResponse({ ok: false, error: 'Too many attempts. Try again later.' }, 429);

  const { token } = await request.json().catch(() => ({}));
  const event = await findEventByToken(env, token);
  if (!event) return jsonResponse({ ok: false, error: 'Edit link not found or no longer valid.' }, 404);
  if (event.visibility === 'removed' || event.visibility === 'rejected') {
    return jsonResponse({ ok: false, error: 'This listing is no longer active. Contact the admin if you need help.' }, 410);
  }

  return jsonResponse({
    ok: true,
    event: {
      title: event.title,
      presented_by: event.presented_by,
      start_at_local: utcToCanberraLocalInput(event.start_at),
      end_at_local: utcToCanberraLocalInput(event.end_at),
      venue_name: event.venue_name,
      venue_address: event.venue_address,
      location_tba: event.location_tba,
      location_reveal_at: event.location_reveal_at,
      location_how_to_find: event.location_how_to_find,
      genres: event.genres,
      lineup: event.lineup,
      ticket_url: event.ticket_url,
      notes: event.notes,
      age_restriction: event.age_restriction,
      visibility: event.visibility,
    },
  });
}

/**
 * POST /api/edit/update. Section 9.2: pending events update directly;
 * published events create an event_changes row for admin review instead.
 */
export async function handleEditUpdate(request, env) {
  const allowed = await checkRateLimit(request, env, 'edit_update', 30);
  if (!allowed) return jsonResponse({ ok: false, error: 'Too many attempts. Try again later.' }, 429);

  const formData = await request.formData();
  const event = await findEventByToken(env, formData.get('token'));
  if (!event) return jsonResponse({ ok: false, error: 'Edit link not found or no longer valid.' }, 404);
  if (event.visibility === 'removed' || event.visibility === 'rejected') {
    return jsonResponse({ ok: false, error: 'This listing is no longer active.' }, 410);
  }

  const fields = readEventFields(formData);
  const errors = validateEventFields(fields);
  if (errors.length) return jsonResponse({ ok: false, error: errors[0] }, 400);

  const venueCheck = await checkVenueRealness(fields);
  if (!venueCheck.skip && !venueCheck.ok) {
    return jsonResponse({ ok: false, error: venueNotFoundMessage(fields) }, 400);
  }

  const now = new Date().toISOString();

  if (event.visibility === 'pending') {
    const terrain = await terrainFieldsFor(fields, event, venueCheck.skip ? undefined : venueCheck.location);
    await env.DB.prepare(
      `UPDATE events SET title = ?, presented_by = ?, start_at = ?, end_at = ?, venue_name = ?, venue_address = ?,
         location_tba = ?, location_reveal_at = ?, location_how_to_find = ?, genres = ?,
         lineup = ?, lineup_equal_billing = ?, ticket_url = ?, notes = ?, age_restriction = ?, updated_at = ?,
         venue_lat = ?, venue_lng = ?, elevation_grid = ? WHERE id = ?`,
    ).bind(
      fields.title, fields.presented_by, fields.start_at, fields.end_at, fields.venue_name, fields.venue_address,
      fields.location_tba, fields.location_reveal_at, fields.location_how_to_find, fields.genres,
      fields.lineup, fields.lineup_equal_billing, fields.ticket_url, fields.notes, fields.age_restriction, now,
      terrain.venue_lat, terrain.venue_lng, terrain.elevation_grid, event.id,
    ).run();

    return jsonResponse({ ok: true, applied: 'direct' });
  }

  await env.DB.prepare(
    'INSERT INTO event_changes (id, event_id, kind, proposed_json, via, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(generateId('chg'), event.id, 'edit', JSON.stringify(fields), 'edit_link', 'pending', now).run();

  return jsonResponse({ ok: true, applied: 'pending_review' });
}

function requestHandler(kind) {
  return async (request, env) => {
    const allowed = await checkRateLimit(request, env, `edit_${kind}`, 10);
    if (!allowed) return jsonResponse({ ok: false, error: 'Too many attempts. Try again later.' }, 429);

    const { token, reason } = await request.json().catch(() => ({}));
    const event = await findEventByToken(env, token);
    if (!event) return jsonResponse({ ok: false, error: 'Edit link not found or no longer valid.' }, 404);
    if (event.visibility === 'removed' || event.visibility === 'rejected') {
      return jsonResponse({ ok: false, error: 'This listing is no longer active.' }, 410);
    }

    await env.DB.prepare(
      'INSERT INTO event_changes (id, event_id, kind, reason, via, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(generateId('chg'), event.id, `${kind}_request`, (reason || '').slice(0, 1000) || null, 'edit_link', 'pending', new Date().toISOString()).run();

    return jsonResponse({ ok: true });
  };
}

export const handleEditCancel = requestHandler('cancel');
export const handleEditRemoval = requestHandler('removal');
