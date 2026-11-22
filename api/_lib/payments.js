import { firestoreTransaction } from './firebase-rest.js';

const JOB_PLANS = {
  job_ad_monthly: { audience: 'employer', plan: 'monthly', amount: 200, months: 1 },
  job_ad_annual: { audience: 'employer', plan: 'annual', amount: 450, months: 12 },
  job_ad_premium: { audience: 'employer', plan: 'premium', amount: 1000, months: 18 },
  job_unlock_monthly: { audience: 'seeker', plan: 'monthly', amount: 150, months: 1 },
  job_unlock_annual: { audience: 'seeker', plan: 'annual', amount: 250, months: 12 },
  job_unlock_premium: { audience: 'seeker', plan: 'premium', amount: 500, months: 18 }
};

function expectedAmount(purpose) {
  if (purpose === 'ai_credit') return 49;
  if (purpose === 'certificate') return 1000;
  return JOB_PLANS[purpose]?.amount || 0;
}

function addMonths(timestamp, months) {
  const date = new Date(timestamp);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.getTime();
}

export async function finalizeConfirmedPayment(externalReference, verifiedTransaction, callbackData = null) {
  if (String(verifiedTransaction?.status || '').toUpperCase() !== 'SUCCESS') return false;
  return firestoreTransaction(async tx => {
    const paymentPath = 'payheroPayments/' + externalReference;
    const payment = await tx.get(paymentPath);
    if (!payment || !payment.ownerUid || payment.externalReference !== externalReference) return false;
    if (payment.status === 'paid') return true;
    if (Number(payment.amount) !== expectedAmount(payment.purpose)) return false;
    if (payment.providerReference && verifiedTransaction.reference &&
        String(payment.providerReference) !== String(verifiedTransaction.reference)) return false;
    if (verifiedTransaction.amount != null && Number(verifiedTransaction.amount) !== Number(payment.amount)) return false;
    if (callbackData && Number(callbackData.Amount) !== Number(payment.amount)) return false;

    let aiAccount = null;
    let certificateEntitlement = null;
    let progress = null;
    const jobPlan = JOB_PLANS[payment.purpose];
    let jobSubscription = null;
    let jobSubscriptionPath = '';
    if (payment.purpose === 'ai_credit') {
      aiAccount = await tx.get('aiAccounts/' + payment.ownerUid) || {};
    } else if (payment.purpose === 'certificate') {
      certificateEntitlement = await tx.get('certificateEntitlements/' + payment.ownerUid + '_' + payment.courseId);
      progress = await tx.get('academyProgress/' + payment.ownerUid + '/courses/' + payment.courseId);
      if (!progress?.courseCompleted) return false;
    } else if (jobPlan) {
      if (payment.audience !== jobPlan.audience || payment.plan !== jobPlan.plan) return false;
      jobSubscriptionPath = (jobPlan.audience === 'employer' ? 'jobAdvertiserSubscriptions/' : 'jobSeekerSubscriptions/') + payment.ownerUid;
      jobSubscription = await tx.get(jobSubscriptionPath) || {};
    } else return false;

    const now = Date.now();
    if (payment.purpose === 'ai_credit') {
      tx.set('aiAccounts/' + payment.ownerUid, {
        ...aiAccount,
        paidCredits: Math.max(0, Number(aiAccount.paidCredits || 0)) + 1,
        updatedAt: now
      });
    } else if (payment.purpose === 'certificate') {
      if (!certificateEntitlement?.paid) {
        tx.set('certificateEntitlements/' + payment.ownerUid + '_' + payment.courseId, {
          ownerUid: payment.ownerUid, courseId: payment.courseId,
          courseTitle: payment.courseTitle || '', paid: true, amount: 1000,
          paymentReference: externalReference, paidAt: now
        });
      }
    } else {
      const previousExpiry = Number(jobSubscription?.expiresAt || 0);
      const startsAt = previousExpiry > now ? previousExpiry : now;
      const expiresAt = jobPlan.months === 1 ? startsAt + 30 * 24 * 60 * 60 * 1000 : addMonths(startsAt, jobPlan.months);
      tx.set(jobSubscriptionPath, {
        ownerUid: payment.ownerUid,
        audience: jobPlan.audience,
        plan: jobPlan.plan,
        active: true,
        startsAt: Number(jobSubscription?.startsAt || 0) > now ? jobSubscription.startsAt : now,
        expiresAt,
        updatedAt: now,
        lastPaymentReference: externalReference,
        lastPaidAt: now,
        amount: jobPlan.amount,
        currency: 'KES'
      });
    }
    tx.set(paymentPath, {
      ...payment, status: 'paid', paidAt: now,
      mpesaReceiptNumber: callbackData?.MpesaReceiptNumber || payment.mpesaReceiptNumber || '',
      providerStatus: verifiedTransaction.status || 'SUCCESS'
    });
    return true;
  });
}
