import crypto from 'node:crypto';

let cachedAccount = null;
let cachedToken = null;
let cachedTokenExpiry = 0;

function getServiceAccount() {
  if (cachedAccount) return cachedAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { const error = new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured in Vercel.'); error.status = 503; throw error; }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('The Firebase service account JSON is missing project_id, client_email or private_key.');
    }
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
    cachedAccount = parsed;
    return parsed;
  } catch (error) {
    const wrapped = new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON: ' + error.message); wrapped.status = 503; throw wrapped;
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function getAdminAccessToken() {
  if (cachedToken && cachedTokenExpiry > Date.now() + 60000) return cachedToken;
  const account = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    base64url(JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = unsigned + '.' + signer.sign(account.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error('Firebase service-account authentication failed. Check the service-account key and Firestore permissions.');
  }
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

function projectId() {
  const account = getServiceAccount();
  return account.project_id || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
}

function documentsBase() {
  const project = projectId();
  if (!project) throw new Error('Firebase project ID is not configured.');
  return 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents';
}

function documentName(path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean || clean.split('/').length % 2 !== 0 || clean.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid Firestore document path.');
  }
  return documentsBase() + '/' + clean.split('/').map(encodeURIComponent).join('/');
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

function encodeFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== undefined) fields[key] = encodeValue(value);
  }
  return fields;
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields || {})) result[key] = decodeValue(value);
  return result;
}

async function firestoreRequest(url, options = {}) {
  const token = await getAdminAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || 'Firestore request failed.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function firestoreGet(path, transaction) {
  const url = documentName(path) + (transaction ? '?transaction=' + encodeURIComponent(transaction) : '');
  const token = await getAdminAccessToken();
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Could not read Firestore document.');
  return decodeFields(data.fields || {});
}

export async function firestoreTransaction(callback) {
  const base = documentsBase();
  const begin = await firestoreRequest(base + ':beginTransaction', {
    method: 'POST',
    body: JSON.stringify({ options: { readWrite: {} } })
  });
  const transaction = begin.transaction;
  if (!transaction) throw new Error('Firestore did not create a transaction.');
  const writes = [];
  const tx = {
    get: path => firestoreGet(path, transaction),
    set: (path, data) => writes.push({
      update: { name: documentName(path), fields: encodeFields(data) }
    }),
    update: (path, data) => writes.push({
      update: { name: documentName(path), fields: encodeFields(data) },
      updateMask: { fieldPaths: Object.keys(data || {}) }
    })
  };
  try {
    const result = await callback(tx);
    if (writes.length) {
      await firestoreRequest(base + ':commit', {
        method: 'POST',
        body: JSON.stringify({ transaction, writes })
      });
    } else {
      await firestoreRequest(base + ':rollback', {
        method: 'POST',
        body: JSON.stringify({ transaction })
      }).catch(() => {});
    }
    return result;
  } catch (error) {
    await firestoreRequest(base + ':rollback', {
      method: 'POST',
      body: JSON.stringify({ transaction })
    }).catch(() => {});
    throw error;
  }
}

export async function firestoreSet(path, data) {
  return firestoreTransaction(async tx => {
    const current = await tx.get(path);
    tx.set(path, { ...(current || {}), ...data });
    return true;
  });
}

export async function requireFirebaseUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  if (!match) {
    const error = new Error('Please sign in to continue.');
    error.status = 401;
    throw error;
  }
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    const error = new Error('Firebase web API key is not configured on the server.');
    error.status = 503;
    throw error;
  }
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: match[1] })
  });
  const data = await response.json().catch(() => ({}));
  const user = data?.users?.[0];
  if (!response.ok || !user?.localId) {
    const error = new Error('Your ShambaVet session has expired. Sign in again.');
    error.status = 401;
    throw error;
  }
  return {
    uid: user.localId,
    email: user.email || '',
    displayName: user.displayName || '',
    providerUserInfo: user.providerUserInfo || []
  };
}

export function sendApiError(res, error) {
  const status = Number(error?.status) || 500;
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status === 500 ? 'The secure payment service could not complete the request.' : error.message
  });
}
