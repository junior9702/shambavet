import { firestoreGet, firestoreSet } from './_lib/firebase-rest.js';
import { getPayHeroTransactionStatus } from './_lib/payhero.js';
import { finalizeConfirmedPayment } from './_lib/payments.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const callback = req.body?.response || req.body || {};
    const externalReference = String(callback.ExternalReference || callback.external_reference || '').trim();
    if (!externalReference) return res.status(400).json({ error: 'ExternalReference is required.' });

    const payment = await firestoreGet('payheroPayments/' + externalReference);
    if (!payment) return res.status(404).json({ error: 'Payment reference not found.' });

    const callbackStatus = String(callback.Status || callback.status || '').toLowerCase();
    const resultCode = callback.ResultCode ?? callback.result_code;
    const callbackSucceeded = callbackStatus === 'success' || String(resultCode) === '0';

    if (!callbackSucceeded) {
      await firestoreSet('payheroPayments/' + externalReference, {
        status: 'failed',
        failureReason: String(callback.ResultDesc || callback.result_description || 'M-PESA payment was not completed').slice(0, 250),
        updatedAt: Date.now()
      });
      return res.status(200).json({ received: true, paid: false });
    }

    if (Number(callback.Amount) !== Number(payment.amount)) {
      return res.status(400).json({ error: 'The callback amount does not match the expected payment amount.' });
    }
    if (!payment.providerReference) {
      return res.status(202).json({ received: true, paid: false, message: 'Waiting for the PayHero transaction reference to be saved.' });
    }

    // PayHero callbacks are correlated to the pending record, then independently checked against PayHero.
    const verified = await getPayHeroTransactionStatus(payment.providerReference);
    if (String(verified.status || '').toUpperCase() !== 'SUCCESS') {
      return res.status(202).json({ received: true, paid: false, message: 'Payment has not yet been confirmed by PayHero.' });
    }
    const paid = await finalizeConfirmedPayment(externalReference, verified, callback);
    return res.status(paid ? 200 : 202).json({ received: true, paid });
  } catch (error) {
    console.error('PayHero callback verification failed:', String(error.message || 'unknown error').slice(0, 250));
    return res.status(500).json({ error: 'Payment callback could not be verified. The app will check the transaction status again.' });
  }
}
