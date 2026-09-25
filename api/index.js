'use strict';
/* Vercel serverless entry point — reuses the app's existing HTTP handler.
 * (req, res) is exactly the model Node's http server uses, so the same
 * handler serves /api, /css, /js, /fonts and SPA fallbacks on Vercel.
 */
const { requestHandler } = require('../server.js');

module.exports = requestHandler;
