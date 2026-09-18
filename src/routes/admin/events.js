import { adminLayout } from '../../templates/admin/layout.js';
import { eventListPage, eventFormPage } from '../../templates/admin/events.js';
import { generateId, eventSlugFor } from '../../lib/ids.js';
import { utcToCanberraLocalInput } from '../../lib/dates.js';
import { readEventFields } from '../../lib/eventFields.js';
import { generateToken, hashToken } from '../../lib/tokens.js';
import { notFound } from '../../lib/http.js';
import { resolveTemplate } from '../../flyers/manifest.js';
import { normaliseEvent } from '../../flyers/normalise.js';
import { terrainFieldsFor } from '../../lib/geocode.js';

function page(admin, title, body) {
  return new Response(String(adminLayout({ title, bodyContent: body, email: admin.email })), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * GET /admin/events?q=...&visibility=...
 */
export async function handleEventList(request, env, admin) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const visibility = url.searchParams.get('visibility');

  let sql = 'SELECT * FROM events WHERE 1=1';
  const params = [];
  if (query) {
    sql += ' AND title LIKE ?';
    params.push(`%${query}%`);
  }
  if (visibility) {
    sql += ' AND visibility = ?';
    params.push(visibility);
  }
  sql += ' ORDER BY start_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return page(admin, 'Events', eventListPage(results, query));
}

async function getCrews(env) {
  const { results } = await env.DB.prepare('SELECT id, name FROM crews ORDER BY name').all();
  return results;
}

function eventForForm(event) {
  return {
    ...event,
    start_at_local: utcToCanberraLocalInput(event.start_at),
    end_at_local: utcToCanberraLocalInput(event.end_at),
  };
}

/**
 * GET /admin/events/new
 */
export async function handleEventNewForm(request, env, admin) {
  const crews = await getCrews(env);
  return page(admin, 'Add an event', eventFormPage({}, crews));
}

/**
 * GET /admin/events/:id/edit
 */
export async function handleEventEditForm(request, env, admin, id) {
  const event = await env.DB.prepare(
    'SELECT events.*, crews.name AS crew_name FROM events LEFT JOIN crews ON crews.id = events.crew_id WHERE events.id = ?',
  ).bind(id).first();
  if (!event) return notFound();
  const crews = await getCrews(env);
  const fromEmail = new URL(request.url).searchParams.get('from_email');
  return page(admin, `Edit: ${event.title || 'Untitled'}`, eventFormPage(eventForForm(event), crews, { fromEmailId: fromEmail }));
}

/**
 * POST /admin/events/new
 */
export async function handleEventCreate(request, env, admin) {
  const formData = await request.formData();
  const fields = readEventFields(formData);
  const now = new Date().toISOString();
  const id = generateId('evt');
  const slug = eventSlugFor(fields.title, fields.start_at);
  const terrain = await terrainFieldsFor(fields);

  await env.DB.prepare(
    `INSERT INTO events (id, slug, title, crew_id, presented_by, start_at, end_at, venue_name, venue_address,
       location_tba, location_reveal_at, location_how_to_find, genres, lineup, lineup_equal_billing, ticket_url, notes,
       age_restriction, status, visibility, source, sequence, created_at, updated_at,
       venue_lat, venue_lng, elevation_grid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'admin', 0, ?, ?, ?, ?, ?)`,
  ).bind(
    id, slug, fields.title, fields.crew_id, fields.presented_by, fields.start_at, fields.end_at,
    fields.venue_name, fields.venue_address, fields.location_tba, fields.location_reveal_at,
    fields.location_how_to_find, fields.genres, fields.lineup, fields.lineup_equal_billing, fields.ticket_url,
    fields.notes, fields.age_restriction, fields.status, now, now,
    terrain.venue_lat, terrain.venue_lng, terrain.elevation_grid,
  ).run();

  return Response.redirect(new URL(`/admin/events/${id}/edit`, request.url), 303);
}

/**
 * POST /admin/events/:id/edit
 */
export async function handleEventUpdate(request, env, admin, id) {
  const event = await env.DB.prepare('SELECT venue_lat, venue_lng, elevation_grid FROM events WHERE id = ?').bind(id).first();
  if (!event) return notFound();

  const formData = await request.formData();
  const fields = readEventFields(formData);
  const now = new Date().toISOString();
  const terrain = await terrainFieldsFor(fields, event);

  await env.DB.prepare(
    `UPDATE events SET title = ?, crew_id = ?, presented_by = ?, start_at = ?, end_at = ?, venue_name = ?,
       venue_address = ?, location_tba = ?, location_reveal_at = ?, location_how_to_find = ?, genres = ?,
       lineup = ?, lineup_equal_billing = ?, ticket_url = ?, notes = ?, age_restriction = ?, status = ?, updated_at = ?,
       venue_lat = ?, venue_lng = ?, elevation_grid = ?
     WHERE id = ?`,
  ).bind(
    fields.title, fields.crew_id, fields.presented_by, fields.start_at, fields.end_at, fields.venue_name,
    fields.venue_address, fields.location_tba, fields.location_reveal_at, fields.location_how_to_find,
    fields.genres, fields.lineup, fields.lineup_equal_billing, fields.ticket_url, fields.notes, fields.age_restriction,
    fields.status, now, terrain.venue_lat, terrain.venue_lng, terrain.elevation_grid, id,
  ).run();

  return Response.redirect(new URL(`/admin/events/${id}/edit`, request.url), 303);
}

/**
 * FLYER-ENGINE-SPEC.md section 8: if the event has no explicit template
 * choice, freeze the auto-routed one into flyer_template at publish time
 * rather than leaving it to resolve fresh on every render -- otherwise the
 * flyer a visitor sees changes as other events get published later, which
 * breaks determinism.
 *
 * This used to also be where an anti-repetition nudge lived: if the last
 * three published events all resolved to the same template, this one was
 * nudged to its second choice. Now that resolveTemplate() only has one
 * auto-routed candidate (contour), that nudge just forced a fallback to
 * medi ("Deep field") every time contour published three times running --
 * which is the "defaulting to the deep field" bug the owner flagged
 * (2026-09-13). Disabled rather than deleted; restore by un-commenting the
 * block below if auto-routing ever gets more than one live candidate again.
 */
export async function freezeFlyerTemplate(env, event) {
  if (event.flyer_template) return;

  const normalised = normaliseEvent(event, {});
  // const { results } = await env.DB.prepare(
  //   "SELECT flyer_template FROM events WHERE visibility = 'published' AND id != ? ORDER BY published_at DESC LIMIT 3",
  // ).bind(event.id).all();
  // const lastThree = results.map((r) => r.flyer_template);
  // const repeated = lastThree.length === 3 && lastThree[0] && lastThree.every((t) => t === lastThree[0])
  //   ? lastThree[0]
  //   : null;
  const repeated = null;

  const template = resolveTemplate(normalised, null, { exclude: repeated });
  await env.DB.prepare('UPDATE events SET flyer_template = ? WHERE id = ?').bind(template.id, event.id).run();
}

/**
 * POST /admin/events/:id/publish. Section 10.2: needs at least a title and
 * start date.
 */
export async function handleEventPublish(request, env, admin, id) {
  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  if (!event) return notFound();

  if (!event.title || !event.start_at) {
    const crews = await getCrews(env);
    const body = eventFormPage(eventForForm(event), crews, {
      errors: ['An event needs at least a title and start date to publish.'],
    });
    return page(admin, `Edit: ${event.title || 'Untitled'}`, body);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE events SET visibility = 'published', published_at = COALESCE(published_at, ?), sequence = sequence + 1, updated_at = ? WHERE id = ?",
  ).bind(now, now, id).run();

  await freezeFlyerTemplate(env, event);

  return Response.redirect(new URL(`/admin/events/${id}/edit`, request.url), 303);
}

function simpleVisibilityChange(newVisibility) {
  return async (request, env, admin, id) => {
    const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
    if (!event) return notFound();
    await env.DB.prepare('UPDATE events SET visibility = ?, updated_at = ? WHERE id = ?')
      .bind(newVisibility, new Date().toISOString(), id).run();
    return Response.redirect(new URL(`/admin/events/${id}/edit`, request.url), 303);
  };
}

export const handleEventReject = simpleVisibilityChange('rejected');
export const handleEventRemove = simpleVisibilityChange('removed');
export const handleEventRestore = simpleVisibilityChange('published');

/**
 * POST /admin/events/:id/reissue-edit-link. Section 9.2: issuing a new one
 * shows it once to the admin, who passes it on.
 */
export async function handleEventReissueEditLink(request, env, admin, id) {
  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  if (!event) return notFound();

  const token = generateToken();
  const tokenHash = await hashToken(token);
  await env.DB.prepare('UPDATE events SET edit_token_hash = ?, updated_at = ? WHERE id = ?')
    .bind(tokenHash, new Date().toISOString(), id).run();

  const crews = await getCrews(env);
  const body = eventFormPage({ ...eventForForm(event), edit_token_hash: tokenHash, newEditLink: `${new URL(request.url).origin}/edit#${token}` }, crews);
  return page(admin, `Edit: ${event.title || 'Untitled'}`, body);
}

export async function handleEventRevokeEditLink(request, env, admin, id) {
  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
  if (!event) return notFound();

  await env.DB.prepare('UPDATE events SET edit_token_hash = NULL, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id).run();

  return Response.redirect(new URL(`/admin/events/${id}/edit`, request.url), 303);
}

/**
 * POST /admin/events/:id/delete. Section 9.4: a genuine hard delete,
 * including its R2 images.
 */
/**
 * POST /admin/events/:id/reroll-flyer. FLYER-ENGINE-SPEC.md section 13:
 * the only way a generated flyer changes appearance without a data or
 * engine change.
 */
export async function handleEventRerollFlyer(request, env, admin, id) {
  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
  if (!event) return notFound();
  await env.DB.prepare('UPDATE events SET seed_salt = seed_salt + 1 WHERE id = ?').bind(id).run();
  return Response.redirect(new URL(`/admin/events/${id}/edit`, request.url), 303);
}

/**
 * POST /admin/events/:id/flyer-template. Section 13: the admin's explicit
 * template choice, or "Auto" (stored as null) to route by genre again.
 */
export async function handleEventSetFlyerTemplate(request, env, admin, id) {
  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
  if (!event) return notFound();
  const formData = await request.formData();
  const value = formData.get('flyer_template') || null;
  await env.DB.prepare('UPDATE events SET flyer_template = ? WHERE id = ?').bind(value, id).run();
  return Response.redirect(new URL(`/admin/events/${id}/edit`, request.url), 303);
}

export async function handleEventDelete(request, env, admin, id) {
  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
  if (!event) return notFound();

  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();

  return Response.redirect(new URL('/admin/events', request.url), 303);
}
