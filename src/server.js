/*
 Minimal Azure Translator proxy with per-request key rotation.
 - Env:
   - AZURE_ENDPOINT: base URL, default https://api.cognitive.microsofttranslator.com
   - AZURE_REGION: optional region header (for global Cognitive Services)
   - AZURE_KEYS: comma-separated list of subscription keys
   - PORT: server port (Render provides)
 - Endpoints:
   - GET/POST /translate -> forwards to {AZURE_ENDPOINT}/translate with same query/body
 - Behavior:
   - Chooses next key in round-robin for each incoming request
   - Passes through status code and JSON/text payload
*/

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const ENDPOINT = process.env.AZURE_ENDPOINT?.replace(/\/$/, '') || 'https://api.cognitive.microsofttranslator.com';
const REGION = process.env.AZURE_REGION || '';
const PROXY_TOKEN = process.env.PROXY_TOKEN || '';
const KEYS = (process.env.AZURE_KEYS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!KEYS.length) {
  console.warn('[WARN] No AZURE_KEYS provided. Set env AZURE_KEYS as comma-separated keys.');
}

let keyIndex = 0;
function nextKey() {
  if (!KEYS.length) return '';
  const key = KEYS[keyIndex % KEYS.length];
  keyIndex = (keyIndex + 1) % KEYS.length;
  return key;
}

function buildAzureUrl(path, query) {
  const url = new URL(ENDPOINT + (path.startsWith('/') ? path : `/${path}`));
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v.forEach(val => url.searchParams.append(k, String(val)));
    } else {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

// Optional access control: require a shared token via header or query when PROXY_TOKEN is set
function authGuard(req, res, next) {
  if (!PROXY_TOKEN) return next();
  const headerToken =
    // Prefer our custom header
    req.get('x-proxy-token') ||
    // Allow clients that can only set Azure header name to carry the access token
    req.get('Ocp-Apim-Subscription-Key') ||
    // Or Bearer token
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const queryToken = req.query && (req.query.token || req.query.access_key || req.query.accessKey);
  const token = headerToken || queryToken;
  if (token === PROXY_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

async function forward(method, path, req, res) {
  const url = buildAzureUrl(path, req.query);
  const body = method === 'GET' ? undefined : JSON.stringify(req.body ?? []);
  const key = nextKey();

  const headers = {
    'Ocp-Apim-Subscription-Key': key,
    'Content-Type': 'application/json',
  };
  if (REGION) headers['Ocp-Apim-Subscription-Region'] = REGION;

  try {
    const data = await fetch(url, {
      method,
      headers,
      body,
    });

    const contentType = data.headers.get('content-type') || '';
    res.status(data.status);
    // Pipe headers selectively
    res.setHeader('x-proxy-upstream', 'azure-translator');

    if (contentType.includes('application/json')) {
      const json = await data.json();
      res.json(json);
    } else {
      const text = await data.text();
      res.send(text);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Bad Gateway', detail: String(err && err.message || err) });
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/translate', authGuard, (req, res) => forward('GET', '/translate', req, res));
app.post('/translate', authGuard, (req, res) => forward('POST', '/translate', req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Key-rotator proxy listening on http://0.0.0.0:${PORT}`);
});
