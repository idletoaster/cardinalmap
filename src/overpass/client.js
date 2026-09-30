'use strict';

const { request } = require('undici');
const cfg = require('../../config');
const log = require('../util/logger');

const OVERPASS_TIMEOUT_MS = 90000;

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Run an Overpass QL query with a small retry loop on 504/429/network errors.
 * Returns the parsed JSON `elements` array.
 */
async function runOverpass(query, opts = {}) {
  const url = cfg.overpass.baseUrl.replace(/\/$/, '') + '/interpreter';
  const body = 'data=' + encodeURIComponent(query);

  let attempt = 0;
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr;

  while (attempt < maxAttempts) {
    attempt += 1;
    const t0 = Date.now();
    try {
      const res = await request(url, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': cfg.overpass.userAgent,
          'Accept': 'application/json',
        },
        bodyTimeout: OVERPASS_TIMEOUT_MS,
        headersTimeout: OVERPASS_TIMEOUT_MS,
      });
      const text = await res.body.text();
      const ms = Date.now() - t0;

      if (res.statusCode === 200) {
        let json;
        try { json = JSON.parse(text); }
        catch (e) {
          log.error('overpass bad json', { attempt, ms, snippet: text.slice(0, 200) });
          throw new Error('overpass returned non-JSON');
        }
        if (json && json.remark && /rate_limited|429|please slow down/i.test(json.remark)) {
          throw Object.assign(new Error('overpass rate-limited'), { status: 429 });
        }
        log.info('overpass ok', { ms, attempt, elements: (json.elements || []).length });
        return json.elements || [];
      }

      // Retry on 429 / 5xx
      if (res.statusCode === 429 || (res.statusCode >= 500 && res.statusCode < 600)) {
        lastErr = new Error(`overpass HTTP ${res.statusCode}`);
        lastErr.status = res.statusCode;
        log.warn('overpass retryable', { attempt, status: res.statusCode, ms });
        await sleep(2000 * attempt);
        continue;
      }

      log.error('overpass non-200', { attempt, status: res.statusCode, ms, snippet: text.slice(0, 200) });
      throw Object.assign(new Error(`overpass HTTP ${res.statusCode}`), { status: 502 });
    } catch (e) {
      // network/timeout/abort
      lastErr = e;
      if (attempt >= maxAttempts) break;
      log.warn('overpass retry', { attempt, err: e.message });
      await sleep(2000 * attempt);
    }
  }

  throw lastErr || new Error('overpass failed');
}

module.exports = { runOverpass };
