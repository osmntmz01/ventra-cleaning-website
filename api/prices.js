const PRICES_KEY = 'ventra:service_prices';

const DEFAULT_PRICES = {
  'Ozone Treatment': 100,
  'Seat Cleaning': 100,
  'Seat + Floor': 180,
  'Spot Cleaning': 70,
  'Ozone 1 Room': 80,
  'Ozone Whole House Per Room': 60,
  'Spot Cleaning Home': 80
};

let memoryPrices = { ...DEFAULT_PRICES };

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizePrices(input) {
  const next = { ...DEFAULT_PRICES };
  if (!input || typeof input !== 'object') return next;

  for (const key of Object.keys(DEFAULT_PRICES)) {
    const value = Number(input[key]);
    next[key] = Number.isFinite(value) && value >= 0 ? Math.round(value) : DEFAULT_PRICES[key];
  }

  return next;
}

async function kvCommand(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`KV request failed with ${response.status}`);
  }

  return response.json();
}

function hasKvConfig() {
  return Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

async function readPrices() {
  const result = await kvCommand(['GET', PRICES_KEY]);
  if (!result) return memoryPrices;
  if (!result.result) return { ...DEFAULT_PRICES };

  try {
    return normalizePrices(JSON.parse(result.result));
  } catch {
    return { ...DEFAULT_PRICES };
  }
}

async function writePrices(prices) {
  const normalized = normalizePrices(prices);
  const result = await kvCommand(['SET', PRICES_KEY, JSON.stringify(normalized)]);

  if (!result) {
    memoryPrices = normalized;
    return normalized;
  }

  return normalized;
}

export default async function handler(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ prices: await readPrices(), persistent: hasKvConfig() });
    }

    if (req.method === 'PUT') {
      const prices = await writePrices(req.body?.prices);
      return res.status(200).json({ success: true, prices, persistent: hasKvConfig() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Prices API error:', error);
    return res.status(500).json({ error: 'Unable to load or update prices' });
  }
}
