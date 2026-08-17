// @ts-check
/**
 * Ledger API transport.
 *
 * PURE: credentials come from the `credentials` argument only — this module
 * never reads `process.env` or the CLI config file. Callers resolve creds their
 * own way (the CLI from its config profiles, workers and agents from their own
 * env) and inject them. See engineering-standards `no-ambient-configuration`.
 *
 * Base URL is origin-only (e.g. https://ledger.finopsbricks.com/); the /api/v1
 * prefix is carried in the paths passed by the resource layer.
 */

/** Row ceiling for auto-paginated fetches (`getAll`). */
export const MAX_ALL_ROWS = 15000;

/**
 * An error returned by the ledger API.
 *
 * `details` is the field that matters and the reason this class exists rather
 * than a plain Error: the ledger reports refusals with the figures involved —
 * which entry index, what the debits and credits totalled, what the difference
 * was — and flattening that into a message string would throw away the only
 * part a caller can act on.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, details?: object }} [opts]
   */
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details ?? null;
  }
}

/** Origin the client talks to when the caller doesn't supply `api_url`. */
export const DEFAULT_API_URL = 'https://ledger.finopsbricks.com';

function resolveCreds(credentials) {
  const api_url = credentials?.api_url ?? DEFAULT_API_URL;
  const api_key = credentials?.api_key;
  const api_secret = credentials?.api_secret;

  if (!api_key || !api_secret) {
    throw new ApiError(
      'Missing ledger credentials: pass { api_key, api_secret } to fobLgr() ' +
        `(api_url optional, defaults to ${DEFAULT_API_URL}).`,
      { code: 'NO_CREDENTIALS' },
    );
  }

  return { api_url, api_key, api_secret };
}

function buildUrl(baseUrl, path, searchParams) {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const url = new URL(path.replace(/^\//, ''), base);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

async function apiRequest(method, path, body, { credentials, searchParams } = {}) {
  const creds = resolveCreds(credentials);
  const url = buildUrl(creds.api_url, path, searchParams);

  const headers = {
    'api-key': creds.api_key,
    'api-secret': creds.api_secret,
    accept: 'application/json',
  };

  const init = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const text = await response.text();

  let respBody = null;
  if (text) {
    try {
      respBody = JSON.parse(text);
    } catch {
      throw new ApiError(
        `Invalid JSON response (status ${response.status}): ${text.slice(0, 200)}`,
        { code: 'INVALID_RESPONSE', status: response.status },
      );
    }
  }

  if (!response.ok) {
    throw new ApiError(
      respBody?.error?.message || `${response.status} ${response.statusText}`,
      {
        code: respBody?.error?.code || 'HTTP_ERROR',
        status: response.status,
        details: respBody?.error?.details,
      },
    );
  }

  return respBody;
}

export function apiGet(path, options) {
  return apiRequest('GET', path, undefined, options);
}

export function apiPost(path, body, options) {
  return apiRequest('POST', path, body ?? {}, options);
}

export function apiPatch(path, body, options) {
  return apiRequest('PATCH', path, body ?? {}, options);
}

export function apiDelete(path, options) {
  return apiRequest('DELETE', path, undefined, options);
}

/**
 * Auto-paginating GET. Walks `page_context.has_more`, concatenating each page's
 * `data`. Ignores `page`/`limit` in `searchParams` and fetches at max page size.
 *
 * Caps at `maxRows` and reports `truncated` rather than silently stopping — a
 * ledger query that quietly returned the first 15,000 of 40,000 entries would
 * produce a total that looks plausible and is wrong.
 *
 * @returns {Promise<{ data: any[], page_context: object|null, truncated: boolean }>}
 */
export async function apiGetAll(path, options = {}, { maxRows = MAX_ALL_ROWS, pageSize = 500 } = {}) {
  const baseParams = { ...(options.searchParams ?? {}) };
  delete baseParams.page;
  delete baseParams.limit;

  const all = [];
  let page = 1;
  let pageContext = null;
  let truncated = false;

  while (true) {
    const result = await apiGet(path, {
      ...options,
      searchParams: { ...baseParams, page, limit: pageSize },
    });

    const rows = result?.data ?? [];
    pageContext = result?.page_context ?? null;

    if (all.length + rows.length > maxRows) {
      all.push(...rows.slice(0, maxRows - all.length));
      truncated = true;
      break;
    }

    all.push(...rows);

    if (!pageContext?.has_more) break;
    page += 1;
  }

  return { data: all, page_context: pageContext, truncated };
}

/**
 * Bind credentials once and return a transport whose methods no longer take a
 * `credentials` argument. This is the seam the resource layer builds on.
 *
 * @param {object} [credentials]
 */
export function createTransport(credentials) {
  return {
    get: (path, options) => apiGet(path, { ...options, credentials }),
    post: (path, body, options) => apiPost(path, body, { ...options, credentials }),
    patch: (path, body, options) => apiPatch(path, body, { ...options, credentials }),
    delete: (path, options) => apiDelete(path, { ...options, credentials }),
    getAll: (path, options, pageOpts) => apiGetAll(path, { ...options, credentials }, pageOpts),
  };
}
