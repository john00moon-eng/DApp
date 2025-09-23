import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

dotenv.config();

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? '3001', 10) || 3001;
const ZAPIER_TOKEN = process.env.ZAPIER_TOKEN ?? '';

const HISTORY_LIMIT = (() => {
  const rawLimit = process.env.ZAPIER_HISTORY_LIMIT;
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 20;
})();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.resolve(__dirname, '../data');
const logFilePath = path.join(dataDirectory, 'zapier-log.json');

let history = [];

const ensureStorage = async () => {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    const fileContent = await fs.readFile(logFilePath, 'utf8');
    const parsed = JSON.parse(fileContent);
    if (Array.isArray(parsed)) {
      history = parsed.slice(0, HISTORY_LIMIT);
    } else {
      history = [];
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      history = [];
      await fs.writeFile(logFilePath, '[]', 'utf8');
    } else {
      console.error('[zapier-hook] Failed to read log file:', error);
      history = [];
    }
  }
};

const persistHistory = async () => {
  try {
    await fs.writeFile(logFilePath, JSON.stringify(history, null, 2), 'utf8');
  } catch (error) {
    console.error('[zapier-hook] Failed to persist log file:', error);
  }
};

const rememberEvent = async (record) => {
  history.unshift(record);
  if (history.length > HISTORY_LIMIT) {
    history.length = HISTORY_LIMIT;
  }

  await persistHistory();
};

const parseOrigins = () => {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) {
    return undefined;
  }

  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return list.length > 0 ? list : undefined;
};

app.use(
  cors({
    origin: parseOrigins(),
  }),
);
app.use(express.json({ limit: '1mb' }));

if (!ZAPIER_TOKEN) {
  console.warn(
    '[zapier-hook] ZAPIER_TOKEN is not set. Webhook calls will be rejected until it is configured.',
  );
}

app.post('/api/zapier-hook', async (req, res) => {
  const providedToken = req.get('X-Zapier-Token');

  if (!providedToken || providedToken !== ZAPIER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
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

  const eventId = typeof id === 'string' && id.trim().length > 0 ? id : crypto.randomUUID();

  const record = {
    id: eventId,
    event,
    triggeredAt: typeof triggeredAt === 'string' && triggeredAt.trim() ? triggeredAt : null,
    receivedAt: new Date().toISOString(),
    payload,
  };

  await rememberEvent(record);

  return res.status(202).json({ status: 'accepted', id: eventId });
});

app.get('/api/zapier-hook/latest', (req, res) => {
  if (history.length === 0) {
    return res.status(204).end();
  }

  return res.json(history[0]);
});

app.get('/api/zapier-hook/history', (req, res) => {
  return res.json({ items: history, count: history.length });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  console.error('[zapier-hook] Unhandled error:', err);
  return res.status(500).json({ error: 'Internal Server Error' });
});

const start = async () => {
  await ensureStorage();

  app.listen(PORT, () => {
    console.log(`🚀 Zapier webhook listener is running on http://localhost:${PORT}`);
  });
};

start().catch((error) => {
  console.error('[zapier-hook] Failed to start server:', error);
  process.exitCode = 1;
});
