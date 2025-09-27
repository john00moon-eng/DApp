import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

import {
  getAllowedOrigins,
  getHistoryLimit,
  getTokenHeaderName,
  getZapierSecret,
  normaliseTokenCandidate,
} from '../lib/config.js';
import {
  getIndicatorHistory,
  getLatestIndicatorEvent,
  getLatestWebhookEvent,
  getStorageMetadata,
  getWebhookHistory,
  persistIndicatorEvent,
  persistWebhookEvent,
} from '../lib/storage.js';

dotenv.config();

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? '3001', 10) || 3001;

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
  origin: allowedOrigins ?? true,
  credentials: true,
};

const tokenHeaderName = getTokenHeaderName();
const webhookSecret = getZapierSecret();

if (!webhookSecret) {
  console.warn(
    '[server] ZAPIER_WEBHOOK_SECRET is not configured. Webhook calls will be rejected until it is set.',
  );
}

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const extractZapierToken = (req) => {
  const headerToken = normaliseTokenCandidate(req.get(tokenHeaderName));
  if (headerToken) {
    return headerToken;
  }

  const authorizationHeader = normaliseTokenCandidate(req.get('Authorization'));
  if (!authorizationHeader) {
    return '';
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer') {
    return normaliseTokenCandidate(token);
  }

  return '';
};

app.post('/api/zapier-hook', async (req, res) => {
  const providedToken = extractZapierToken(req);

  if (!webhookSecret || !providedToken || providedToken !== webhookSecret) {
    return res.status(401).json({
      error: 'Unauthorized',
      hint: `Provide a valid token via the \`${tokenHeaderName}\` header or the Authorization: Bearer header.`,
    });
  }

  const payload = req.body;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Payload must be a JSON object' });
  }

  const { event, data, id, triggeredAt } = payload;

  if (typeof event !== 'string' || event.trim().length === 0) {
    return res.status(400).json({ error: 'Field "event" is required' });
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return res.status(400).json({ error: 'Field "data" must be an object' });
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
    console.error('[server] Failed to persist indicator snapshot:', error);
  }

  return res.status(202).json({ status: 'accepted', id: recordId });
});

app.get('/api/zapier-hook/latest', async (req, res) => {
  const latest = await getLatestWebhookEvent();
  if (!latest) {
    return res.status(204).end();
  }

  return res.json(latest);
});

app.get('/api/zapier-hook/history', async (req, res) => {
  const { limit } = req.query;
  const items = await getWebhookHistory(limit);
  return res.json({ items, count: items.length, limit: getHistoryLimit() });
});

app.get('/api/indicator/latest', async (req, res) => {
  try {
    const latest = await getLatestIndicatorEvent();
    if (!latest) {
      return res.status(204).end();
    }

    return res.json(latest);
  } catch (error) {
    console.error('[server] Failed to fetch latest indicator event:', error);
    return res.status(500).json({ error: 'Failed to load indicator values' });
  }
});

app.get('/api/indicator/history', async (req, res) => {
  const { limit } = req.query;

  try {
    const items = await getIndicatorHistory(limit);
    const metadata = await getStorageMetadata();
    return res.json({ items, count: items.length, storage: metadata });
  } catch (error) {
    console.error('[server] Failed to fetch indicator history:', error);
    return res.status(500).json({ error: 'Failed to load indicator history' });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  console.error('[server] Unhandled error:', err);
  return res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Zapier webhook listener is running on http://localhost:${PORT}`);
});
