import crypto from 'node:crypto';

const b64url = value => Buffer.from(value).toString('base64url');
const fromB64url = value => Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}
function expand(prk, info, length) {
  let output = Buffer.alloc(0), previous = Buffer.alloc(0), counter = 1;
  while (output.length < length) {
    previous = hmac(prk, Buffer.concat([previous, Buffer.from(info), Buffer.from([counter++])]));
    output = Buffer.concat([output, previous]);
  }
  return output.subarray(0, length);
}
function vapidToken(endpoint, publicKey, privateKey, subject) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64url(JSON.stringify({ aud: audience, exp: now + 12 * 60 * 60, sub: subject }));
  const unsigned = header + '.' + body;
  const publicBytes = fromB64url(publicKey);
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url(publicBytes.subarray(1, 33)), y: b64url(publicBytes.subarray(33, 65)), d: b64url(fromB64url(privateKey)) },
    format: 'jwk'
  });
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return unsigned + '.' + b64url(signature);
}

function encryptPayload(subscription, payload) {
  const userPublic = fromB64url(subscription.keys.p256dh);
  const authSecret = fromB64url(subscription.keys.auth);
  if (userPublic.length !== 65 || authSecret.length < 16) throw new Error('Invalid browser push encryption keys.');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(userPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), userPublic, serverPublic]);
  const ikm = expand(hmac(authSecret, sharedSecret), keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = expand(prk, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = expand(prk, 'Content-Encoding: nonce\0', 12);
  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([serverPublic.length]), serverPublic, encrypted]);
}

export async function sendWebPush(subscription, payload, options = {}) {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT || 'mailto:support@shambavet.co.ke';
  if (!publicKey || !privateKey) throw new Error('VAPID keys are not configured.');
  const token = vapidToken(subscription.endpoint, publicKey, privateKey, subject);
  const body = encryptPayload(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'vapid t=' + token + ', k=' + publicKey,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(options.ttl || 3600),
      'Urgency': 'normal'
    },
    body
  });
  if (!response.ok) {
    const error = new Error('Push service returned HTTP ' + response.status);
    error.statusCode = response.status;
    throw error;
  }
  return true;
}
