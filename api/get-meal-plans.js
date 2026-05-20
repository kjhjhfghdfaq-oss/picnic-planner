const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ids = await kv.lrange('meal-plans', 0, 19);
  if (!ids || ids.length === 0) return res.status(200).json({ plans: [] });

  const plans = await Promise.all(ids.map(id => kv.get(`plan:${id}`)));
  return res.status(200).json({ plans: plans.filter(Boolean) });
};
