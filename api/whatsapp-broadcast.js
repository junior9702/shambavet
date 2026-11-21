import { requireFirebaseUser, firestoreGet, firestoreListCollection } from './_lib/firebase-rest.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const user = await requireFirebaseUser(req);
    const admin = await firestoreGet('admins/' + user.uid);
    if (!admin?.enabled || admin?.role !== 'developer') return res.status(403).json({ error: 'Developer administrator access required.' });
    const { title, message } = req.body || {};
    if (!String(title || '').trim() || !String(message || '').trim()) return res.status(400).json({ error: 'Title and message are required.' });
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    if (!token || !phoneNumberId || !templateName) return res.status(503).json({ error: 'WhatsApp Business API is not configured. Add the Meta access token, phone number ID and approved template name in Vercel.' });
    const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v27.0';
    const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
    const recipients = (await firestoreListCollection('whatsappOptIns', 1000)).filter(item => item.active === true && item.consent === true && item.phone);
    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      const response = await fetch('https://graph.facebook.com/' + version + '/' + phoneNumberId + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient.phone, type: 'template',
          template: { name: templateName, language: { code: language }, components: [{ type: 'body', parameters: [
            { type: 'text', text: String(title).slice(0, 100) },
            { type: 'text', text: String(message).slice(0, 900) }
          ] }] }
        })
      });
      if (response.ok) sent++; else failed++;
    }
    return res.status(200).json({ ok: true, sent, failed, optedInRecipients: recipients.length });
  } catch (error) {
    return res.status(Number(error.status) || 500).json({ error: error.status ? error.message : 'WhatsApp broadcast failed.' });
  }
}
