import { firestoreTransaction } from './firebase-rest.js';

function expectedAmount(purpose) {
  if (purpose === 'ai_credit') return 49;
  if (purpose === 'certificate') return 1000;
  return 0;
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
    if (callbackData && Number(callbackData.Amount) !== Number(payment.amount)) return false;

    let aiAccount = null;
    let certificateEntitlement = null;
    let progress = null;
    if (payment.purpose === 'ai_credit') {
      aiAccount = await tx.get('aiAccounts/' + payment.ownerUid) || {};
    } else if (payment.purpose === 'certificate') {
      certificateEntitlement = await tx.get('certificateEntitlements/' + payment.ownerUid + '_' + payment.courseId);
      progress = await tx.get('academyProgress/' + payment.ownerUid + '/courses/' + payment.courseId);
      if (!progress?.courseCompleted) return false;
    } else {
      return false;
    }

    const now = Date.now();
    if (payment.purpose === 'ai_credit') {
      tx.set('aiAccounts/' + payment.ownerUid, {
        ...aiAccount,
        paidCredits: Math.max(0, Number(aiAccount.paidCredits || 0)) + 1,
        updatedAt: now
      });
    } else if (!certificateEntitlement?.paid) {
      tx.set('certificateEntitlements/' + payment.ownerUid + '_' + payment.courseId, {
        ownerUid: payment.ownerUid,
        courseId: payment.courseId,
        courseTitle: payment.courseTitle || '',
        paid: true,
        amount: 1000,
        paymentReference: externalReference,
        paidAt: now
      });
    }
    tx.set(paymentPath, {
      ...payment,
      status: 'paid',
      paidAt: now,
      mpesaReceiptNumber: callbackData?.MpesaReceiptNumber || payment.mpesaReceiptNumber || '',
      providerStatus: verifiedTransaction.status || 'SUCCESS'
    });
    return true;
  });
}
