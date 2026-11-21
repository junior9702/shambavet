import { randomUUID } from 'node:crypto';
import { firestoreGet, firestoreSet, firestoreTransaction, requireFirebaseUser, sendApiError } from '../_lib/firebase-rest.js';
import { getPayHeroChannelId, initiatePayHeroStk, normalizeKenyanPhone } from '../_lib/payhero.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const user = await requireFirebaseUser(req);
    const body = req.body || {};
    const purpose = String(body.purpose || '');
    if (!['ai_credit', 'certificate'].includes(purpose)) {
      return res.status(400).json({ error: 'Choose a valid ShambaVet payment purpose.' });
    }

    let amount = purpose === 'ai_credit' ? 49 : 1000;
    let course = null;
    if (purpose === 'certificate') {
      if (!user.email && !(user.providerUserInfo || []).length) {
        return res.status(403).json({ error: 'Create a permanent learner account before purchasing a course certificate.' });
      }
      const courseId = String(body.courseId || '').trim();
      if (!courseId || courseId.length > 150 || courseId.includes('/')) {
        return res.status(400).json({ error: 'A valid course is required for the certificate.' });
      }
      const entitlement = await firestoreGet('certificateEntitlements/' + user.uid + '_' + courseId);
      if (entitlement?.paid === true) {
        return res.status(200).json({ alreadyPaid: true, courseId, message: 'This certificate has already been paid for. You can download it again at no extra charge.' });
      }
      const progress = await firestoreGet('academyProgress/' + user.uid + '/courses/' + courseId);
      if (!progress?.courseCompleted) {
        return res.status(403).json({ error: 'Complete every course module with the required pass mark before purchasing its certificate.' });
      }
      course = await firestoreGet('academyCourses/' + courseId);
      if (!course || !Array.isArray(course.modules) || !course.modules.length) {
        return res.status(404).json({ error: 'The course could not be found.' });
      }
      const completed = Array.isArray(progress.completedModules) ? progress.completedModules : [];
      if (!course.modules.every(module => completed.includes(module.id))) {
        return res.status(403).json({ error: 'Your course completion record is incomplete. Please refresh your learning dashboard.' });
      }
    } else {
      const account = await firestoreGet('aiAccounts/' + user.uid) || {};
      if (Number(account.paidCredits || 0) > 0) {
        return res.status(200).json({ alreadyHasCredit: true, message: 'You already have an unused AI consultation credit.' });
      }
    }

    // The first call checks eligibility without creating a payment. The browser then asks for the M-PESA number.
    if (!body.phone) {
      return res.status(200).json({ requiresPhone: true, amount, purpose });
    }

    const phone = normalizeKenyanPhone(body.phone);
    getPayHeroChannelId();
    const externalReference = 'SV-' + randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
    const paymentRecord = {
      externalReference,
      ownerUid: user.uid,
      purpose,
      amount,
      currency: 'KES',
      phone,
      courseId: course ? String(body.courseId) : '',
      courseTitle: course?.title || '',
      status: 'initiating',
      createdAt: Date.now()
    };
    await firestoreTransaction(async tx => {
      const throttlePath = 'payheroThrottles/' + user.uid + '_' + purpose;
      const throttle = await tx.get(throttlePath) || {};
      const now = Date.now();
      if (Number(throttle.lastAttemptAt || 0) && now - Number(throttle.lastAttemptAt) < 45000) {
        const error = new Error('Please wait 45 seconds before requesting another M-PESA prompt. This helps prevent duplicate requests.');
        error.status = 429;
        throw error;
      }
      tx.set(throttlePath, { ownerUid: user.uid, purpose, lastAttemptAt: now, lastExternalReference: externalReference });
    });
    await firestoreSet('payheroPayments/' + externalReference, paymentRecord);

    try {
      const result = await initiatePayHeroStk({
        amount,
        phone,
        externalReference,
      });
      await firestoreSet('payheroPayments/' + externalReference, {
        providerReference: String(result.reference),
        checkoutRequestId: String(result.CheckoutRequestID || ''),
        merchantRequestId: String(result.MerchantRequestID || ''),
        status: 'pending',
        stkSentAt: Date.now()
      });
      return res.status(200).json({
        success: true,
        externalReference,
        status: 'pending',
        message: 'M-PESA prompt sent. Check your phone and enter your M-PESA PIN to complete the payment.'
      });
    } catch (error) {
      await firestoreSet('payheroPayments/' + externalReference, {
        status: 'failed_to_initiate',
        failureReason: String(error.message || 'PayHero initiation failed').slice(0, 250),
        updatedAt: Date.now()
      }).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (/not configured|service-account|channel_id/i.test(String(error.message || '')) && !error.status) error.status = 503;
    return sendApiError(res, error);
  }
}
