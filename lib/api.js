'use strict';
/* API router: matches method + path, builds context, applies cookies, sends JSON. */

const { sendJSON, readBody } = require('./util');
const { getSessionUser, ApiError, requireUser } = require('./auth');

const modules = [require('./routes/auth'), require('./routes/money'), require('./routes/account')];

const routes = [];
modules.forEach((m) => m.forEach((r) => routes.push(r)));

routes.forEach((r) => {
  const keys = [];
  const pattern = r.path.replace(/:([A-Za-z_]+)/g, (m, k) => {
    keys.push(k);
    return '([^/]+)';
  });
  r._regex = new RegExp('^' + pattern + '/?$');
  r._keys = keys;
});

function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r._regex.exec(pathname);
    if (!m) continue;
    const params = {};
    r._keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1]);
    });
    return { route: r, params };
  }
  return null;
}

async function handleApi(req, res, pathname, searchParams) {
  const method = req.method || 'GET';
  const found = match(method, pathname);
  if (!found) {
    if (pathname.startsWith('/api/')) {
      sendJSON(res, 404, { error: 'Endpoint not found.' });
      return true;
    }
    return false; // not an API route
  }

  const cookies = [];
  let body = {};
  try {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      body = await readBody(req);
    }
  } catch (err) {
    sendJSON(res, err.status || 400, { error: err.message || 'Invalid request.' });
    return true;
  }

  const session = getSessionUser(req);
  const query = {};
  searchParams.forEach((v, k) => {
    query[k] = v;
  });

  const ctx = {
    req,
    res,
    body,
    query,
    params: found.params,
    user: session.user,
    sessionToken: session.token,
    setCookie(value) {
      cookies.push(value);
    }
  };

  try {
    const result = await found.route.handler(ctx);
    if (result && result.__raw) return true; // handler wrote the response itself
    const status = (result && result.__status) || 200;
    const data = result && Object.prototype.hasOwnProperty.call(result, '__data') ? result.__data : result;
    if (cookies.length) {
      res.setHeader('Set-Cookie', cookies);
    }
    sendJSON(res, status, data === undefined ? { ok: true } : data);
    return true;
  } catch (err) {
    const status = err instanceof ApiError || err.status ? err.status || 500 : 500;
    if (status >= 500) console.error('[api]', method, pathname, err);
    const payload = { error: err.message || 'Something went wrong.' };
    if (err.fields) payload.fields = err.fields;
    sendJSON(res, status, payload);
    return true;
  }
}

module.exports = { handleApi, requireUser, ApiError };
