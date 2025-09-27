import { randomUUID } from 'node:crypto';

import { withCors } from '../../lib/cors.js';
import {
  getTokenHeaderName,
  getZapierSecret,
  normaliseTokenCandidate,
} from '../../lib/config.js';
import { persistIndicatorEvent, persistWebhookEvent } from '../../lib/storage.js';

const ensureJsonBody = (req) => {
  if (!req.body || typeof req.body !== 'string') {
    return req.body;
  }

  try {
    return JSON.parse(req.body);
  } catch (error) {
    throw Object.assign(new SyntaxError('Invalid JSON payload'), { cause: error });
  }
};

const extractZapierToken = (req, headerName) => {
  const headerKey = headerName.toLowerCase();
  const headerToken = normaliseTokenCandidate(req.headers[headerKey] ?? req.headers[headerName]);
  if (headerToken) {
    return headerToken;
  }

  const authorizationHeader = normaliseTokenCandidate(req.headers.authorization);
  if (!authorizationHeader) {
    return '';
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer') {
    return normaliseTokenCandidate(token);
  }

  return '';
};

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST,OPTIONS');
    res.json({ error: 'Method Not Allowed' });
    return;
  }

  let payload;
  try {
    payload = ensureJsonBody(req);
  } catch (error) {
    res.statusCode = 400;
    res.json({ error: 'Invalid JSON payload' });
    return;
  }

  const secret = getZapierSecret();
  const tokenHeader = getTokenHeaderName();
  const providedToken = extractZapierToken(req, tokenHeader);

  if (!secret || !providedToken || providedToken !== secret) {
    res.statusCode = 401;
    res.json({
      error: 'Unauthorized',
      hint: `Provide a valid token via the \`${tokenHeader}\` header or the Authorization: Bearer header.`,
    });
    return;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    res.statusCode = 400;
    res.json({ error: 'Payload must be a JSON object' });
    return;
  }

  const { event, data, id, triggeredAt } = payload;

  if (typeof event !== 'string' || event.trim().length === 0) {
    res.statusCode = 400;
    res.json({ error: 'Field "event" is required' });
    return;
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    res.statusCode = 400;
    res.json({ error: 'Field "data" must be an object' });
    return;
  }

  const recordId = typeof id === 'string' && id.trim().length > 0 ? id : randomUUID();

  const record = {
    id: recordId,
    event,
    triggeredAt: typeof triggeredAt === 'string' && triggeredAt.trim() ? triggeredAt : null,
    receivedAt: new Date().toISOString(),
    payload,
  };

  await persistWebhookEvent(record);

  try {
    await persistIndicatorEvent(record);
  } catch (error) {
    console.error('[api/zapier-hook] Failed to persist indicator snapshot:', error);
  }

  res.statusCode = 202;
  res.json({ status: 'accepted', id: recordId });
};

export default withCors(handler);
