import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

let db = null;
let dbFilePath = null;

const NORMALIZED_KEY_CACHE = new Map();

const normalizeKey = (key) => {
  const cacheKey = String(key ?? '');
  if (NORMALIZED_KEY_CACHE.has(cacheKey)) {
    return NORMALIZED_KEY_CACHE.get(cacheKey);
  }

  const normalized = cacheKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');

  NORMALIZED_KEY_CACHE.set(cacheKey, normalized);
  return normalized;
};

const coerceString = (value) => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return '';
};

const coerceNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const coerceDateString = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) {
      return fromNumber.toISOString();
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && String(numeric).length >= 10) {
      const fromNumeric = new Date(numeric);
      if (!Number.isNaN(fromNumeric.getTime())) {
        return fromNumeric.toISOString();
      }
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    return trimmed;
  }

  return null;
};

const resolvePayloadValue = (payload, keys) => {
  if (!payload || typeof payload !== 'object' || !Array.isArray(keys)) {
    return undefined;
  }

  const normalizedEntries = new Map();

  for (const [rawKey, value] of Object.entries(payload)) {
    const normalized = normalizeKey(rawKey);
    if (!normalizedEntries.has(normalized)) {
      normalizedEntries.set(normalized, value);
    }
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const value = payload[key];
      if (value !== undefined) {
        return value;
      }
    }

    const normalizedKey = normalizeKey(key);
    if (normalizedEntries.has(normalizedKey)) {
      const value = normalizedEntries.get(normalizedKey);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
};

const extractIndicatorPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload;
};

const extractIndicatorRecord = (record) => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const payload = extractIndicatorPayload(record.payload ?? record.data ?? record);

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const ticker = coerceString(
    resolvePayloadValue(payload, ['ticker', 'symbol', 'pair', 'market_pair', 'instrument'])
  );
  const exchange = coerceString(resolvePayloadValue(payload, ['exchange', 'venue', 'market']));
  const timeframe = coerceString(resolvePayloadValue(payload, ['timeframe', 'interval', 'resolution']));
  const condition = coerceString(resolvePayloadValue(payload, ['condition', 'rule', 'direction']));
  const price = coerceNumber(resolvePayloadValue(payload, ['price', 'close', 'last_price']));
  const mvrvzBtc = coerceNumber(resolvePayloadValue(payload, ['mvrvz_btc', 'mvrvzbtc', 'mvrvz_btc_value']));
  const mvrvzEth = coerceNumber(resolvePayloadValue(payload, ['mvrvz_eth', 'mvrvzeth', 'mvrvz_eth_value']));
  const message = coerceString(
    resolvePayloadValue(payload, [
      'message',
      'alert',
      'description',
      'payload_alert_message',
      'payload alert message'
    ])
  );
  const source = coerceString(resolvePayloadValue(payload, ['source', 'origin', 'channel']));
  const primaryAsset = coerceString(
    resolvePayloadValue(payload, ['message_mvrvz', 'payload_alert_message_mvrvz', 'asset'])
  );
  const triggeredAt =
    coerceDateString(record.triggeredAt ?? resolvePayloadValue(payload, ['triggered_at', 'time'])) ??
    null;
  const receivedAt = coerceDateString(record.receivedAt ?? resolvePayloadValue(payload, ['received_at'])) ?? null;

  if (!ticker && mvrvzBtc == null && mvrvzEth == null && !message) {
    return null;
  }

  return {
    id: coerceString(record.id) || null,
    event: coerceString(record.event) || null,
    ticker: ticker || null,
    exchange: exchange || null,
    timeframe: timeframe || null,
    condition: condition || null,
    price,
    mvrvz_btc: mvrvzBtc,
    mvrvz_eth: mvrvzEth,
    message: message || null,
    source: source || null,
    primary_asset: primaryAsset || null,
    triggered_at: triggeredAt,
    received_at: receivedAt,
    raw_payload: JSON.stringify(payload)
  };
};

export const initIndicatorStorage = async (dataDirectory) => {
  if (!dataDirectory) {
    throw new Error('Data directory is required to initialise indicator storage.');
  }

  await fs.mkdir(dataDirectory, { recursive: true });

  dbFilePath = path.join(dataDirectory, 'indicator-values.db');
  db = new Database(dbFilePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS indicator_events (
      id TEXT PRIMARY KEY,
      event TEXT,
      ticker TEXT,
      exchange TEXT,
      timeframe TEXT,
      condition TEXT,
      price REAL,
      mvrvz_btc REAL,
      mvrvz_eth REAL,
      message TEXT,
      source TEXT,
      primary_asset TEXT,
      triggered_at TEXT,
      received_at TEXT,
      raw_payload TEXT NOT NULL
    );
  `);
};

export const storeIndicatorEvent = (record) => {
  if (!db) {
    throw new Error('Indicator storage is not initialised.');
  }

  const entry = extractIndicatorRecord(record);
  if (!entry) {
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO indicator_events (
      id,
      event,
      ticker,
      exchange,
      timeframe,
      condition,
      price,
      mvrvz_btc,
      mvrvz_eth,
      message,
      source,
      primary_asset,
      triggered_at,
      received_at,
      raw_payload
    ) VALUES (
      @id,
      @event,
      @ticker,
      @exchange,
      @timeframe,
      @condition,
      @price,
      @mvrvz_btc,
      @mvrvz_eth,
      @message,
      @source,
      @primary_asset,
      @triggered_at,
      @received_at,
      @raw_payload
    )
    ON CONFLICT(id) DO UPDATE SET
      event = excluded.event,
      ticker = excluded.ticker,
      exchange = excluded.exchange,
      timeframe = excluded.timeframe,
      condition = excluded.condition,
      price = excluded.price,
      mvrvz_btc = excluded.mvrvz_btc,
      mvrvz_eth = excluded.mvrvz_eth,
      message = excluded.message,
      source = excluded.source,
      primary_asset = excluded.primary_asset,
      triggered_at = excluded.triggered_at,
      received_at = excluded.received_at,
      raw_payload = excluded.raw_payload;
  `);

  stmt.run(entry);
};

export const getLatestIndicatorEvent = () => {
  if (!db) {
    throw new Error('Indicator storage is not initialised.');
  }

  const row = db
    .prepare(
      `
        SELECT *
        FROM indicator_events
        ORDER BY
          COALESCE(received_at, triggered_at) DESC,
          rowid DESC
        LIMIT 1
      `
    )
    .get();

  if (!row) {
    return null;
  }

  return {
    ...row,
    price: row.price != null ? Number(row.price) : null,
    mvrvz_btc: row.mvrvz_btc != null ? Number(row.mvrvz_btc) : null,
    mvrvz_eth: row.mvrvz_eth != null ? Number(row.mvrvz_eth) : null
  };
};

export const getIndicatorHistory = (limit = 50) => {
  if (!db) {
    throw new Error('Indicator storage is not initialised.');
  }

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;

  const rows = db
    .prepare(
      `
        SELECT *
        FROM indicator_events
        ORDER BY
          COALESCE(received_at, triggered_at) DESC,
          rowid DESC
        LIMIT ?
      `
    )
    .all(safeLimit);

  return rows.map((row) => ({
    ...row,
    price: row.price != null ? Number(row.price) : null,
    mvrvz_btc: row.mvrvz_btc != null ? Number(row.mvrvz_btc) : null,
    mvrvz_eth: row.mvrvz_eth != null ? Number(row.mvrvz_eth) : null
  }));
};

export const getIndicatorDatabasePath = () => dbFilePath;
