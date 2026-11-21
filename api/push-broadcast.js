import { sendWebPush } from './_lib/web-push.js';
import { requireFirebaseUser, firestoreGet, firestoreListCollection } from './_lib/firebase-rest.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const user = await requireFirebaseUser(req);
    const admin = await firestoreGet('admins/' + user.uid);
    if (!admin?.enabled || admin?.role !== 'developer') return res.status(403).json({ error: 'Developer administrator access required.' });
    const { title, message, link = '/' } = req.body || {};
    if (!String(title || '').trim() || !String(message || '').trim()) return res.status(400).json({ error: 'Title and message are required.' });
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return res.status(503).json({ error: 'Browser push is not configured yet. Add the VAPID keys in Vercel.' });
    const subscriptions = await firestoreListCollection('pushSubscriptions', 1000);
    let sent = 0, failed = 0, expired = 0;
    const activeSubscriptions = subscriptions.filter(item => item.active && item.subscription?.endpoint);
    const batch = activeSubscriptions.slice(0, 200);
    const payload = JSON.stringify({ title: String(title).slice(0, 100), body: String(message).slice(0, 220), url: String(link).startsWith('/') ? String(link) : '/' });
    for (let i = 0; i < batch.length; i += 20) {
      await Promise.all(batch.slice(i, i + 20).map(async record => {
        try { await sendWebPush(record.subscription, payload, { ttl: 60 * 60 }); sent++; }
        catch (error) {
          failed++;
          if (error.statusCode === 404 || error.statusCode === 410) {
            expired++;
            const { firestoreSet } = await import('./_lib/firebase-rest.js');
            await firestoreSet('pushSubscriptions/' + record.id, { ...record, active: false, updatedAt: new Date().toISOString() }).catch(() => {});
          }
        }
      }));
    }
    return res.status(200).json({ ok: true, sent, failed, expired, eligibleDevices: activeSubscriptions.length, notProcessed: Math.max(0, activeSubscriptions.length - batch.length) });
  } catch (error) {
    return res.status(Number(error.status) || 500).json({ error: error.status ? error.message : 'Push delivery failed.' });
  }
}
