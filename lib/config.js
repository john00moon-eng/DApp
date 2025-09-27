const cached = new Map();

const memo = (key, factory) => {
  if (cached.has(key)) {
    return cached.get(key);
  }
  const value = factory();
  cached.set(key, value);
  return value;
};

export const getZapierSecret = () =>
  memo('zapierSecret', () => {
    const direct = process.env.ZAPIER_WEBHOOK_SECRET;
    if (direct && direct.trim()) {
      return direct.trim();
    }
    const legacy = process.env.ZAPIER_TOKEN;
    return legacy ? legacy.trim() : '';
  });

export const getTokenHeaderName = () =>
  memo('tokenHeader', () => (process.env.ZAPIER_TOKEN_HEADER || 'X-Zapier-Token').trim());

export const getHistoryLimit = () =>
  memo('historyLimit', () => {
    const raw = process.env.ZAPIER_HISTORY_LIMIT;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, 100);
    }
    return 20;
  });

export const getIndicatorHistoryLimit = () =>
  memo('indicatorHistoryLimit', () => {
    const raw = process.env.INDICATOR_HISTORY_LIMIT;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, 500);
    }
    return 200;
  });

export const getAllowedOrigins = () =>
  memo('allowedOrigins', () => {
    const raw = process.env.CORS_ALLOWED_ORIGINS;
    if (!raw) {
      return undefined;
    }

    const list = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return list.length > 0 ? list : undefined;
  });

export const getKvNamespace = () =>
  memo('kvNamespace', () => (process.env.KV_NAMESPACE || 'pulse-protocol').trim());

export const hasKvCredentials = () =>
  memo('hasKv', () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN));

export const getStorageBackendDescription = () =>
  memo('storageDescription', () => {
    if (hasKvCredentials()) {
      return `Vercel KV namespace "${getKvNamespace()}"`;
    }
    return 'in-memory storage (non-persistent)';
  });

export const normaliseTokenCandidate = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).find(Boolean) ?? '';
  }

  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};
