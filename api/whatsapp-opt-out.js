import { requireFirebaseUser, firestoreSet } from './_lib/firebase-rest.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const user = await requireFirebaseUser(req);
    await firestoreSet('whatsappOptIns/' + user.uid, { uid: user.uid, active: false, consent: false, optedOutAt: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(Number(error.status) || 500).json({ error: error.status ? error.message : 'Could not update WhatsApp preferences.' });
  }
}
