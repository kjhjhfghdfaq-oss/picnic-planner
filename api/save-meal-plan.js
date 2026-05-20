const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { persons, budget, diet, meals } = req.body || {};
  if (!meals || !Array.isArray(meals) || meals.length === 0) {
    return res.status(400).json({ error: 'Missing meals' });
  }

  const id = Date.now().toString();
  const plan = { id, date: new Date().toISOString(), persons, budget, diet, meals };

  await kv.set(`plan:${id}`, plan);
  await kv.lpush('meal-plans', id);
  await kv.ltrim('meal-plans', 0, 19);

  return res.status(200).json({ ok: true, id });
};
