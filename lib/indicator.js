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
    return value.toISOString();
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

export const extractIndicatorRecord = (record) => {
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
      'payload alert message',
    ])
  );
  const source = coerceString(resolvePayloadValue(payload, ['source', 'origin', 'channel']));
  const primaryAsset = coerceString(
    resolvePayloadValue(payload, ['message_mvrvz', 'payload_alert_message_mvrvz', 'asset'])
  );
  const triggeredAt =
    coerceDateString(record.triggeredAt ?? resolvePayloadValue(payload, ['triggered_at', 'time'])) ??
    null;
  const receivedAt =
    coerceDateString(record.receivedAt ?? resolvePayloadValue(payload, ['received_at'])) ?? null;

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
    raw_payload: JSON.stringify(payload),
  };
};

export const __testing = {
  normalizeKey,
  coerceString,
  coerceNumber,
  coerceDateString,
  resolvePayloadValue,
  extractIndicatorPayload,
};
