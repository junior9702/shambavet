import webpush from 'web-push';
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
    const subject = process.env.WEB_PUSH_SUBJECT || 'mailto:support@shambavet.co.ke';
    if (!publicKey || !privateKey) return res.status(503).json({ error: 'Browser push is not configured yet. Add the VAPID keys in Vercel.' });
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const subscriptions = await firestoreListCollection('pushSubscriptions', 1000);
    let sent = 0, failed = 0, expired = 0;
    const payload = JSON.stringify({ title: String(title).slice(0, 100), body: String(message).slice(0, 220), url: String(link).startsWith('/') ? String(link) : '/' });
    for (const record of subscriptions.filter(item => item.active && item.subscription?.endpoint)) {
      try { await webpush.sendNotification(record.subscription, payload, { TTL: 60 * 60 }); sent++; }
      catch (error) {
        failed++;
        if (error.statusCode === 404 || error.statusCode === 410) {
          expired++;
          // A later re-subscription overwrites the same endpoint record.
          const { firestoreSet } = await import('./_lib/firebase-rest.js');
          await firestoreSet('pushSubscriptions/' + record.id, { ...record, active: false, updatedAt: new Date().toISOString() }).catch(() => {});
        }
      }
    }
    return res.status(200).json({ ok: true, sent, failed, expired });
  } catch (error) {
    return res.status(Number(error.status) || 500).json({ error: error.status ? error.message : 'Push delivery failed.' });
  }
}
