import { getAllowedOrigins } from './config.js';

const resolveAllowedOrigin = (reqOrigin, allowedList) => {
  if (!allowedList || allowedList.length === 0) {
    return '*';
  }

  if (allowedList.includes('*')) {
    return reqOrigin || '*';
  }

  if (reqOrigin && allowedList.includes(reqOrigin)) {
    return reqOrigin;
  }

  if (!reqOrigin && allowedList.includes('null')) {
    return 'null';
  }

  return allowedList[0];
};

export const withCors = (handler) => async (req, res) => {
  const allowedList = getAllowedOrigins();
  const origin = req.headers.origin;
  const allowedOrigin = resolveAllowedOrigin(origin, allowedList);

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ||
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  return handler(req, res);
};
