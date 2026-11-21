import { requireFirebaseUser, firestoreGet, firestoreSet } from './_lib/firebase-rest.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const user = await requireFirebaseUser(req);
    if (req.method === 'GET') { const preference = await firestoreGet('whatsappOptIns/' + user.uid); return res.status(200).json({ active: preference?.active === true && preference?.consent === true, phone: preference?.phone || '' }); }
    const { phone, consent } = req.body || {};
    if (consent !== true) return res.status(400).json({ error: 'Explicit WhatsApp consent is required.' });
    const normalized = String(phone || '').replace(/[\\s()-]/g, '');
    if (!/^\\+?[1-9]\\d{7,14}$/.test(normalized)) return res.status(400).json({ error: 'Enter a valid international phone number, e.g. +2547XXXXXXXX.' });
    await firestoreSet('whatsappOptIns/' + user.uid, {
      uid: user.uid, phone: normalized.startsWith('+') ? normalized.slice(1) : normalized,
      consent: true, consentAt: new Date().toISOString(), active: true
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(Number(error.status) || 500).json({ error: error.status ? error.message : 'Could not save WhatsApp consent.' });
  }
}
