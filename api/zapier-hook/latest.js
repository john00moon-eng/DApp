import { withCors } from '../../lib/cors.js';
import { getLatestWebhookEvent } from '../../lib/storage.js';

const handler = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET,OPTIONS');
    res.json({ error: 'Method Not Allowed' });
    return;
  }

  const latest = await getLatestWebhookEvent();
  if (!latest) {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.json(latest);
};

export default withCors(handler);
