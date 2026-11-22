import { randomUUID } from 'node:crypto';
import { firestoreGet, firestoreSet, firestoreTransaction, requireFirebaseUser, sendApiError } from '../_lib/firebase-rest.js';
import { getPayHeroChannelId, initiatePayHeroStk, normalizeKenyanPhone } from '../_lib/payhero.js';

const PLANS = {
  employer_monthly: { purpose: 'job_ad_monthly', audience: 'employer', plan: 'monthly', amount: 200 },
  employer_annual: { purpose: 'job_ad_annual', audience: 'employer', plan: 'annual', amount: 450 },
  employer_premium: { purpose: 'job_ad_premium', audience: 'employer', plan: 'premium', amount: 1000 },
  seeker_monthly: { purpose: 'job_unlock_monthly', audience: 'seeker', plan: 'monthly', amount: 150 },
  seeker_annual: { purpose: 'job_unlock_annual', audience: 'seeker', plan: 'annual', amount: 250 },
  seeker_premium: { purpose: 'job_unlock_premium', audience: 'seeker', plan: 'premium', amount: 500 }
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  try {
    const user = await requireFirebaseUser(req);
    if (!user.email && !(user.providerUserInfo || []).length) {
      const error = new Error('Please use a permanent Google or email account before purchasing a job subscription.');
      error.status = 403; throw error;
    }
    const body = req.body || {};
    const selected = PLANS[String(body.plan || '')];
    if (!selected) { const error = new Error('Choose a valid job subscription plan.'); error.status = 400; throw error; }
    if (!body.phone) return res.status(200).json({ requiresPhone: true, amount: selected.amount, audience: selected.audience, plan: selected.plan });
    const phone = normalizeKenyanPhone(body.phone);
    getPayHeroChannelId();
    if (!process.env.PAYHERO_API_USERNAME || !process.env.PAYHERO_API_PASSWORD) {
      const error = new Error('PayHero API credentials are not configured.'); error.status = 503; throw error;
    }
    const externalReference = 'JOB-' + randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
    const now = Date.now();
    await firestoreTransaction(async tx => {
      const throttlePath = 'payheroThrottles/' + user.uid + '_' + selected.purpose;
      const throttle = await tx.get(throttlePath) || {};
      if (Number(throttle.lastAttemptAt || 0) && now - Number(throttle.lastAttemptAt) < 45000) {
        const error = new Error('Please wait 45 seconds before requesting another M-PESA prompt.'); error.status = 429; throw error;
      }
      tx.set(throttlePath, { ownerUid: user.uid, purpose: selected.purpose, lastAttemptAt: now, lastExternalReference: externalReference });
    });
    await firestoreSet('payheroPayments/' + externalReference, {
      externalReference, ownerUid: user.uid, purpose: selected.purpose,
      audience: selected.audience, plan: selected.plan, amount: selected.amount,
      currency: 'KES', phone, status: 'initiating', createdAt: now
    });
    try {
      const result = await initiatePayHeroStk({ amount: selected.amount, phone, externalReference });
      await firestoreSet('payheroPayments/' + externalReference, {
        providerReference: String(result.reference),
        checkoutRequestId: String(result.CheckoutRequestID || ''),
        merchantRequestId: String(result.MerchantRequestID || ''),
        status: 'pending', stkSentAt: Date.now()
      });
      return res.status(200).json({ success: true, externalReference, status: 'pending', amount: selected.amount, message: 'M-PESA prompt sent. Enter your PIN to complete payment.' });
    } catch (error) {
      await firestoreSet('payheroPayments/' + externalReference, { status: 'failed_to_initiate', failureReason: String(error.message || 'PayHero initiation failed').slice(0, 250), updatedAt: Date.now() }).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (/not configured|service-account|channel_id/i.test(String(error.message || '')) && !error.status) error.status = 503;
    return sendApiError(res, error);
  }
}
