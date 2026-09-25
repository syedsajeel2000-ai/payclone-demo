/* PayClone API client — thin fetch wrapper. */

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status || 0;
    this.fields = fields || null;
  }
}

async function parse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: {}
  };
  if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch (e) {
    throw new ApiError('Cannot reach the server. Is it still running?', 0);
  }
  const data = await parse(res);
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data && data.fields);
  }
  return data;
}

/* Raw response (used for receipt downloads). */
export async function apiRaw(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...options });
  } catch (e) {
    throw new ApiError('Cannot reach the server.', 0);
  }
  if (!res.ok) {
    const data = await parse(res);
    if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new ApiError((data && data.error) || 'Request failed.', res.status, data && data.fields);
  }
  return res;
}
