const DOCUMENTS_KEY = 'ventra:admin_documents';
const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
const memoryDocuments = { invoices: [], quotes: [], counters: { invoice: 0, quote: 0 } };

function storageConfigError() {
  const error = new Error('Document storage is not configured');
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

function emptyStore() {
  return { invoices: [], quotes: [], counters: { invoice: 0, quote: 0 } };
}

function normalizeStore(input) {
  const store = emptyStore();
  if (!input || typeof input !== 'object') return store;

  store.invoices = Array.isArray(input.invoices) ? input.invoices : [];
  store.quotes = Array.isArray(input.quotes) ? input.quotes : [];
  store.counters.invoice = Math.max(0, Number(input.counters?.invoice || 0) || 0);
  store.counters.quote = Math.max(0, Number(input.counters?.quote || 0) || 0);
  return store;
}

async function readDocuments() {
  const result = await kvCommand(['GET', DOCUMENTS_KEY]);
  if (!result) {
    if (isProduction) throw storageConfigError();
    return memoryDocuments;
  }
  if (!result.result) return emptyStore();

  try {
    return normalizeStore(JSON.parse(result.result));
  } catch {
    return emptyStore();
  }
}

async function writeDocuments(store) {
  const normalized = normalizeStore(store);
  const result = await kvCommand(['SET', DOCUMENTS_KEY, JSON.stringify(normalized)]);
  if (!result) {
    if (isProduction) throw storageConfigError();
    memoryDocuments.invoices = normalized.invoices;
    memoryDocuments.quotes = normalized.quotes;
    memoryDocuments.counters = normalized.counters;
  }
  return normalized;
}

function cleanText(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
}

function getCollectionName(type) {
  return type === 'invoice' ? 'invoices' : 'quotes';
}

function getDocumentNumber(data, type) {
  return cleanText(type === 'invoice' ? data.invoiceNumber : data.quoteNumber, 80);
}

function getNumericSuffix(value) {
  const match = String(value || '').match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function getNextNumber(store, type) {
  const collection = store[getCollectionName(type)];
  const maxExisting = collection.reduce((max, item) => Math.max(max, getNumericSuffix(item.number)), 0);
  const currentCounter = Number(store.counters?.[type] || 0) || 0;
  const minimumCounter = type === 'invoice' ? 26000 : 0;
  const next = Math.max(minimumCounter, currentCounter, maxExisting) + 1;
  store.counters[type] = next;
  return type === 'invoice' ? String(next) : `VQ-${next}`;
}

function summarizeDocument(type, data, number, existing = {}) {
  const now = new Date().toISOString();
  const status = cleanText(data.status || existing.status || 'active', 20);
  const cancelledAt = status === 'cancelled'
    ? cleanText(data.cancelledAt || existing.cancelledAt || now, 40)
    : '';
  return {
    id: existing.id || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    type,
    number,
    status,
    cancelledAt,
    timestamp: existing.timestamp || now,
    updatedAt: now,
    documentDate: type === 'invoice' ? data.invoiceDate : data.quoteDate,
    customerName: cleanText(data.customerName, 120),
    customerEmail: cleanText(data.customerEmail, 120),
    customerPhone: cleanText(data.customerPhone, 80),
    total: Number(data.total || 0),
    data
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const store = await readDocuments();
      const type = cleanText(req.query.type, 20);
      const documents = type === 'invoice'
        ? store.invoices
        : (type === 'quote' ? store.quotes : [...store.invoices, ...store.quotes]);
      documents.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      return res.status(200).json({ documents, counters: store.counters, persistent: hasKvConfig() });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const type = cleanText(req.body?.type, 20);
      if (!['invoice', 'quote'].includes(type)) {
        return res.status(400).json({ error: 'Invalid document type' });
      }

      const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : null;
      if (!data) {
        return res.status(400).json({ error: 'Missing document data' });
      }

      const store = await readDocuments();
      const collectionName = getCollectionName(type);
      const collection = store[collectionName];
      const id = cleanText(req.body?.id, 100);
      const existing = id ? collection.find(item => String(item.id) === id) : null;
      const number = existing?.number || getNextNumber(store, type);

      if (type === 'invoice') data.invoiceNumber = number;
      if (type === 'quote') data.quoteNumber = number;

      const document = summarizeDocument(type, data, number, existing || {});
      if (existing) {
        const index = collection.findIndex(item => String(item.id) === id);
        collection[index] = document;
      } else {
        collection.push(document);
      }

      await writeDocuments(store);
      return res.status(existing ? 200 : 201).json({ success: true, document, counters: store.counters, persistent: hasKvConfig() });
    }

    if (req.method === 'DELETE') {
      const type = cleanText(req.query.type, 20);
      const id = cleanText(req.query.id, 100);
      if (!['invoice', 'quote'].includes(type) || !id) {
        return res.status(400).json({ error: 'Missing id or invalid document type' });
      }

      const store = await readDocuments();
      const collectionName = getCollectionName(type);
      const current = store[collectionName];
      const next = current.filter(item => String(item.id) !== id);
      if (next.length === current.length) {
        return res.status(404).json({ error: 'Document not found' });
      }

      store[collectionName] = next;
      await writeDocuments(store);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Documents API error:', error);
    if (error.statusCode === 500 && error.message === 'Document storage is not configured') {
      return res.status(500).json({ error: 'Document storage is not configured', persistent: false });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
