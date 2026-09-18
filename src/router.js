import { handleHome } from './routes/home.js';
import { handleEventPage, handleEventIcs } from './routes/event.js';
import { handleArchive } from './routes/archive.js';
import { handleHarmReduction } from './routes/harmReduction.js';
import { handleCalendarFeed } from './routes/calendarFeed.js';
import { handleGo } from './routes/go.js';
import { handleRobots } from './routes/robots.js';
import { adminRouter } from './routes/admin/router.js';
import { handleSubmitForm, handleSubmitConfirmation, handleSubmissionApi, handleVenueCheck } from './routes/submit.js';
import { handleEditPage, handleEditLoad, handleEditUpdate, handleEditCancel, handleEditRemoval } from './routes/edit.js';
import {
  handleCrewPage, handleCrewLogin, handleCrewEventList, handleCrewEventCreate,
  handleCrewEventUpdate, handleCrewEventStatus, handleCrewEventUnpublish, handleCrewProfileUpdate,
  handleCrewEventFlyer, handleCrewEventFlyerTemplate, handleCrewEventRerollFlyer, handleCrewFlyerPreview,
} from './routes/crew.js';
import { handleContactForm, handleContactSent, handleContactApi } from './routes/contact.js';
import { handleCrewsDirectory, handleCrewProfile } from './routes/crews.js';
import { handlePoster } from './routes/poster.js';
import { handleFlyer } from './routes/flyer.js';
import { notFound } from './lib/http.js';

/**
 * Simple path-based router. Section 6 lists every route.
 * @param {Request} request
 * @param {import('./env.js').Env} env
 */
export async function router(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/') return handleHome(request, env);
  if (path === '/admin' || path.startsWith('/admin/')) return adminRouter(request, env);
  if (path === '/robots.txt') return handleRobots();
  if (path === '/calendar.ics') return handleCalendarFeed(request, env);
  if (path === '/look-after-each-other') return handleHarmReduction(request, env);
  if (path === '/archive') return handleArchive(request, env);

  const archiveYear = path.match(/^\/archive\/(\d{4})$/);
  if (archiveYear) return handleArchive(request, env, Number(archiveYear[1]));

  if (path === '/submit' && method === 'GET') return handleSubmitForm(request, env);
  if (path === '/submit/confirmation' && method === 'GET') return handleSubmitConfirmation(request, env);
  if (path === '/api/submissions' && method === 'POST') return handleSubmissionApi(request, env);
  if (path === '/api/venue-check' && method === 'POST') return handleVenueCheck(request, env);

  if (path === '/edit' && method === 'GET') return handleEditPage(request, env);
  if (path === '/api/edit/load' && method === 'POST') return handleEditLoad(request, env);
  if (path === '/api/edit/update' && method === 'POST') return handleEditUpdate(request, env);
  if (path === '/api/edit/cancel' && method === 'POST') return handleEditCancel(request, env);
  if (path === '/api/edit/removal' && method === 'POST') return handleEditRemoval(request, env);

  if (path === '/crew' && method === 'GET') return handleCrewPage(request, env);
  if (path === '/api/crew/login' && method === 'POST') return handleCrewLogin(request, env);
  if (path === '/api/crew/events/list' && method === 'POST') return handleCrewEventList(request, env);
  if (path === '/api/crew/events/create' && method === 'POST') return handleCrewEventCreate(request, env);
  if (path === '/api/crew/profile' && method === 'POST') return handleCrewProfileUpdate(request, env);
  if (path === '/api/crew/flyer-preview' && method === 'POST') return handleCrewFlyerPreview(request, env);

  const crewEventAction = path.match(/^\/api\/crew\/events\/([^/]+)\/(update|status|unpublish|flyer|flyer-template|reroll-flyer)$/);
  if (crewEventAction && method === 'POST') {
    const [, id, action] = crewEventAction;
    const handlers = {
      update: handleCrewEventUpdate, status: handleCrewEventStatus, unpublish: handleCrewEventUnpublish,
      flyer: handleCrewEventFlyer, 'flyer-template': handleCrewEventFlyerTemplate, 'reroll-flyer': handleCrewEventRerollFlyer,
    };
    return handlers[action](request, env, id);
  }

  if (path === '/poster' && method === 'GET') return handlePoster(request, env);

  if (path === '/crews' && method === 'GET') return handleCrewsDirectory(request, env);
  const crewSlug = path.match(/^\/crews\/([^/]+)$/);
  if (crewSlug && method === 'GET') return handleCrewProfile(request, env, crewSlug[1]);

  if (path === '/contact' && method === 'GET') return handleContactForm(request, env);
  if (path === '/contact/sent' && method === 'GET') return handleContactSent(request, env);
  if (path === '/api/contact' && method === 'POST') return handleContactApi(request, env);

  const eventIcs = path.match(/^\/e\/([^/]+)\.ics$/);
  if (eventIcs) return handleEventIcs(request, env, eventIcs[1]);

  const eventSlug = path.match(/^\/e\/([^/]+)$/);
  if (eventSlug) return handleEventPage(request, env, eventSlug[1]);

  const goEventId = path.match(/^\/go\/([^/]+)$/);
  if (goEventId) return handleGo(request, env, goEventId[1]);

  const flyerEventId = path.match(/^\/flyer\/([^/]+)\.svg$/);
  if (flyerEventId) return handleFlyer(request, env, flyerEventId[1]);

  return env.ASSETS.fetch(request).then((response) => {
    if (response.status !== 404) return response;
    return notFound();
  });
}
