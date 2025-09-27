import { extractIndicatorRecord } from './indicator.js';
import {
  getHistoryLimit,
  getIndicatorHistoryLimit,
  getKvNamespace,
  getStorageBackendDescription,
  hasKvCredentials,
} from './config.js';

const memoryState = {
  webhookHistory: [],
  indicatorHistory: [],
  latestWebhook: null,
  latestIndicator: null,
};

const kvState = {
  initialised: false,
  client: null,
};

const getKvClient = async () => {
  if (kvState.initialised) {
    return kvState.client;
  }

  kvState.initialised = true;

  if (!hasKvCredentials()) {
    kvState.client = null;
    return kvState.client;
  }

  try {
    const mod = await import('@vercel/kv');
    kvState.client = mod.kv;
  } catch (error) {
    console.error('[storage] Failed to load @vercel/kv client:', error);
    kvState.client = null;
  }

  return kvState.client;
};

const parseJson = (value) => {
  if (value == null) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('[storage] Failed to parse JSON value from KV:', error);
    return null;
  }
};

const clampLimit = (value, fallback, max) => {
  const parsed = Number.isInteger(value) ? value : Number.parseInt(value ?? '', 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return Math.min(parsed, max);
  }
  return fallback;
};

const namespace = getKvNamespace();
const WEBHOOK_HISTORY_KEY = `${namespace}:webhook:history`;
const WEBHOOK_LATEST_KEY = `${namespace}:webhook:latest`;
const INDICATOR_HISTORY_KEY = `${namespace}:indicator:history`;
const INDICATOR_LATEST_KEY = `${namespace}:indicator:latest`;

const rememberWebhookInMemory = (record, limit) => {
  memoryState.webhookHistory.unshift(record);
  if (memoryState.webhookHistory.length > limit) {
    memoryState.webhookHistory.length = limit;
  }
  memoryState.latestWebhook = record;
};

const rememberIndicatorInMemory = (entry, limit) => {
  memoryState.indicatorHistory.unshift(entry);
  if (memoryState.indicatorHistory.length > limit) {
    memoryState.indicatorHistory.length = limit;
  }
  memoryState.latestIndicator = entry;
};

export const persistWebhookEvent = async (record) => {
  if (!record || typeof record !== 'object') {
    throw new Error('Webhook record must be an object.');
  }

  const limit = getHistoryLimit();

  const client = await getKvClient();
  if (client) {
    const payload = JSON.stringify(record);
    try {
      await client.lpush(WEBHOOK_HISTORY_KEY, payload);
      await client.ltrim(WEBHOOK_HISTORY_KEY, 0, limit - 1);
      await client.set(WEBHOOK_LATEST_KEY, payload);
    } catch (error) {
      console.error('[storage] Failed to persist webhook event to KV:', error);
    }
  }

  rememberWebhookInMemory(record, limit);
  return record;
};

export const getLatestWebhookEvent = async () => {
  const client = await getKvClient();
  if (client) {
    try {
      const value = await client.get(WEBHOOK_LATEST_KEY);
      const parsed = parseJson(value);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.error('[storage] Failed to read latest webhook event from KV:', error);
    }
  }

  return memoryState.latestWebhook ?? memoryState.webhookHistory[0] ?? null;
};

export const getWebhookHistory = async (limit) => {
  const fallbackLimit = getHistoryLimit();
  const effectiveLimit = clampLimit(limit, fallbackLimit, 100);

  const client = await getKvClient();
  if (client) {
    try {
      const items = await client.lrange(WEBHOOK_HISTORY_KEY, 0, effectiveLimit - 1);
      if (Array.isArray(items) && items.length > 0) {
        return items
          .map((item) => parseJson(item))
          .filter(Boolean);
      }
    } catch (error) {
      console.error('[storage] Failed to read webhook history from KV:', error);
    }
  }

  return memoryState.webhookHistory.slice(0, effectiveLimit);
};

export const persistIndicatorEvent = async (record) => {
  const entry = extractIndicatorRecord(record);
  if (!entry) {
    return null;
  }

  const limit = getIndicatorHistoryLimit();

  const client = await getKvClient();
  if (client) {
    const payload = JSON.stringify(entry);
    try {
      await client.lpush(INDICATOR_HISTORY_KEY, payload);
      await client.ltrim(INDICATOR_HISTORY_KEY, 0, limit - 1);
      await client.set(INDICATOR_LATEST_KEY, payload);
    } catch (error) {
      console.error('[storage] Failed to persist indicator event to KV:', error);
    }
  }

  rememberIndicatorInMemory(entry, limit);
  return entry;
};

export const getLatestIndicatorEvent = async () => {
  const client = await getKvClient();
  if (client) {
    try {
      const value = await client.get(INDICATOR_LATEST_KEY);
      const parsed = parseJson(value);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.error('[storage] Failed to read latest indicator event from KV:', error);
    }
  }

  return memoryState.latestIndicator ?? memoryState.indicatorHistory[0] ?? null;
};

export const getIndicatorHistory = async (limit) => {
  const fallbackLimit = getIndicatorHistoryLimit();
  const effectiveLimit = clampLimit(limit, fallbackLimit, 500);

  const client = await getKvClient();
  if (client) {
    try {
      const items = await client.lrange(INDICATOR_HISTORY_KEY, 0, effectiveLimit - 1);
      if (Array.isArray(items) && items.length > 0) {
        return items
          .map((item) => parseJson(item))
          .filter(Boolean);
      }
    } catch (error) {
      console.error('[storage] Failed to read indicator history from KV:', error);
    }
  }

  return memoryState.indicatorHistory.slice(0, effectiveLimit);
};

export const getStorageMetadata = async () => ({
  backend: getStorageBackendDescription(),
  namespace,
  kvEnabled: Boolean(await getKvClient()),
  historyLimit: getHistoryLimit(),
  indicatorHistoryLimit: getIndicatorHistoryLimit(),
});
