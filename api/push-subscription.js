import { createHash } from 'node:crypto';
import { requireFirebaseUser, firestoreSet } from './_lib/firebase-rest.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const user = await requireFirebaseUser(req);
    const { action, subscription } = req.body || {};
    if (action === 'subscribe') {
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'A valid browser push subscription is required.' });
      }
      let endpointUrl;
      try { endpointUrl = new URL(subscription.endpoint); } catch { return res.status(400).json({ error: 'Invalid push endpoint URL.' }); }
      const host = endpointUrl.hostname.toLowerCase();
      const allowedHost = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host === 'push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com');
      if (endpointUrl.protocol !== 'https:' || !allowedHost) return res.status(400).json({ error: 'Unsupported browser push provider endpoint.' });
      const id = createHash('sha256').update(user.uid + '|' + subscription.endpoint).digest('hex');
      await firestoreSet('pushSubscriptions/' + id, {
        uid: user.uid, subscription, active: true, updatedAt: new Date().toISOString()
      });
      return res.status(200).json({ ok: true });
    }
    if (action === 'unsubscribe') {
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Subscription endpoint is required.' });
      const id = createHash('sha256').update(user.uid + '|' + subscription.endpoint).digest('hex');
      await firestoreSet('pushSubscriptions/' + id, { uid: user.uid, subscription, active: false, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown subscription action.' });
  } catch (error) {
    return res.status(Number(error.status) || 500).json({ error: error.status ? error.message : 'Could not save push settings.' });
  }
}
