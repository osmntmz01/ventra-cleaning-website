const REVIEWS_KEY = 'ventra:reviews';
const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
const memoryReviews = [];

function storageConfigError() {
  const error = new Error('Review storage is not configured');
  error.statusCode = 500;
  return error;
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

async function readReviews() {
  const result = await kvCommand(['GET', REVIEWS_KEY]);
  if (!result) {
    if (isProduction) throw storageConfigError();
    return memoryReviews;
  }
  if (!result.result) return [];

  try {
    const parsed = JSON.parse(result.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeReviews(reviews) {
  const result = await kvCommand(['SET', REVIEWS_KEY, JSON.stringify(reviews)]);
  if (!result) {
    if (isProduction) throw storageConfigError();
    memoryReviews.length = 0;
    memoryReviews.push(...reviews);
  }
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const reviews = await readReviews();
      const rating = Math.max(1, Math.min(5, Number(req.body?.rating || 5)));
      const review = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
        timestamp: new Date().toISOString(),
        status: 'pending',
        name: cleanText(req.body?.name, 80),
        suburb: cleanText(req.body?.suburb, 80),
        text: cleanText(req.body?.text, 600),
        rating: Number.isFinite(rating) ? Math.round(rating) : 5,
        source: 'website'
      };

      if (!review.name || !review.suburb || !review.text) {
        return res.status(400).json({ error: 'Missing required review details' });
      }

      reviews.push(review);
      await writeReviews(reviews);

      return res.status(201).json({ success: true, review, persistent: hasKvConfig() });
    }

    if (req.method === 'GET') {
      const status = cleanText(req.query.status, 20);
      let reviews = await readReviews();
      if (status) reviews = reviews.filter(review => review.status === status);
      reviews.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      return res.status(200).json({ reviews, persistent: hasKvConfig() });
    }

    if (req.method === 'PATCH') {
      const id = cleanText(req.query.id, 80);
      const status = cleanText(req.query.status, 20);

      if (!id || !['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Missing id or invalid status' });
      }

      const reviews = await readReviews();
      const review = reviews.find(item => String(item.id) === String(id));
      if (!review) {
        return res.status(404).json({ error: 'Review not found' });
      }

      review.status = status;
      review.updatedAt = new Date().toISOString();
      await writeReviews(reviews);
      return res.status(200).json({ success: true, review });
    }

    if (req.method === 'DELETE') {
      const id = cleanText(req.query.id, 80);
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const reviews = await readReviews();
      const nextReviews = reviews.filter(item => String(item.id) !== String(id));
      if (nextReviews.length === reviews.length) {
        return res.status(404).json({ error: 'Review not found' });
      }

      await writeReviews(nextReviews);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Reviews API error:', error);
    if (error.statusCode === 500 && error.message === 'Review storage is not configured') {
      return res.status(500).json({ error: 'Review storage is not configured', persistent: false });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
