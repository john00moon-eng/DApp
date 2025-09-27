import { withCors } from '../../lib/cors.js';
import { getIndicatorHistory } from '../../lib/storage.js';

const handler = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET,OPTIONS');
    res.json({ error: 'Method Not Allowed' });
    return;
  }

  const limit = req.query?.limit;
  const items = await getIndicatorHistory(limit);

  res.statusCode = 200;
  res.json({ items, count: items.length });
};

export default withCors(handler);
