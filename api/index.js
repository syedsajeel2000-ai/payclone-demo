'use strict';
/* Vercel serverless entry point — reuses the app's existing HTTP handler.
 * (req, res) is exactly the model Node's http server uses, so the same
 * handler serves /api, /css, /js, /fonts and SPA fallbacks on Vercel.
 *
 * Persistence: before serving a request the data layer hydrates from
 * Upstash Redis (if configured); after the handler finishes we hold the
 * lambda open until queued writes have flushed, so no mutation is lost
 * when the instance freezes right after responding.
 */
const { requestHandler } = require('../server.js');
const db = require('../lib/db.js');

module.exports = async (req, res) => {
  try {
    await db.prime();
  } catch (e) {
    console.error('[api] db prime failed:', e.message);
  }
  await requestHandler(req, res);
  try {
    await db.flush();
  } catch (e) {
    console.error('[api] db flush failed:', e.message);
  }
};
