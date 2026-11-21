import { requireFirebaseUser, firestoreGet, firestoreSet, sendApiError } from './_lib/firebase-rest.js';
import { getPayHeroTransactionStatus } from './_lib/payhero.js';
import { finalizeConfirmedPayment } from './_lib/payments.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

  try {
    const user = await requireFirebaseUser(req);
    const reference = String(req.query?.reference || '').trim();
    if (!reference || reference.length > 100) return res.status(400).json({ error: 'Payment reference is required.' });

    const payment = await firestoreGet('payheroPayments/' + reference);
    if (!payment || payment.ownerUid !== user.uid) {
      return res.status(404).json({ error: 'This payment could not be found for your account.' });
    }
    if (payment.status === 'paid') {
      return res.status(200).json({ paid: true, status: 'SUCCESS', purpose: payment.purpose, amount: payment.amount });
    }
    if (payment.status === 'failed' || payment.status === 'failed_to_initiate') {
      return res.status(200).json({
        paid: false,
        status: 'FAILED',
        failureReason: payment.failureReason || 'PayHero reported that the payment was not completed.'
      });
    }
    if (!payment.providerReference) {
      return res.status(200).json({
        paid: false,
        status: payment.status || 'PENDING',
        failureReason: payment.failureReason || ''
      });
    }

    const verified = await getPayHeroTransactionStatus(payment.providerReference);
    const status = String(verified.status || 'PENDING').toUpperCase();
    if (status === 'SUCCESS') {
      const paid = await finalizeConfirmedPayment(reference, verified);
      return res.status(200).json({ paid, status, purpose: payment.purpose, amount: payment.amount });
    }
    if (status === 'FAILED') {
      const failureReason = payment.failureReason || 'PayHero reported that the payment failed. Check the M-PESA message on your phone for more detail.';
      await firestoreSet('payheroPayments/' + reference, {
        status: 'failed',
        failureReason,
        updatedAt: Date.now()
      });
      return res.status(200).json({ paid: false, status, failureReason });
    }
    return res.status(200).json({
      paid: false,
      status,
      failureReason: payment.failureReason || ''
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}
