import { firestoreGet, firestoreTransaction } from './firebase-rest.js';

const FREE_CHECKS = 2;
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function getAIUsage(uid) {
  const account = await firestoreGet('aiAccounts/' + uid) || {};
  const now = Date.now();
  const startedAt = Number(account.freeWindowStartedAt || 0);
  const used = startedAt && now - startedAt < FREE_WINDOW_MS ? Number(account.freeUsed || 0) : 0;
  return {
    freeRemaining: Math.max(0, FREE_CHECKS - used),
    paidCredits: Math.max(0, Number(account.paidCredits || 0)),
    resetsAt: startedAt && now - startedAt < FREE_WINDOW_MS ? startedAt + FREE_WINDOW_MS : now + FREE_WINDOW_MS
  };
}

export async function reserveAIUsage(uid) {
  return firestoreTransaction(async tx => {
    const path = 'aiAccounts/' + uid;
    const current = await tx.get(path) || {};
    const now = Date.now();
    const previousStart = Number(current.freeWindowStartedAt || 0);
    const windowValid = previousStart > 0 && now - previousStart < FREE_WINDOW_MS;
    const freeWindowStartedAt = windowValid ? previousStart : now;
    const freeUsed = windowValid ? Number(current.freeUsed || 0) : 0;
    const paidCredits = Math.max(0, Number(current.paidCredits || 0));
    if (freeUsed < FREE_CHECKS) {
      tx.set(path, { ...current, freeWindowStartedAt, freeUsed: freeUsed + 1, paidCredits, updatedAt: now });
      return { kind: 'free' };
    }
    if (paidCredits > 0) {
      tx.set(path, { ...current, freeWindowStartedAt, freeUsed, paidCredits: paidCredits - 1, updatedAt: now });
      return { kind: 'paid' };
    }
    return null;
  });
}

export async function refundAIUsage(uid, reservation) {
  if (!reservation) return;
  await firestoreTransaction(async tx => {
    const path = 'aiAccounts/' + uid;
    const current = await tx.get(path) || {};
    const now = Date.now();
    if (reservation.kind === 'paid') {
      tx.set(path, { ...current, paidCredits: Math.max(0, Number(current.paidCredits || 0)) + 1, updatedAt: now });
    } else {
      const startedAt = Number(current.freeWindowStartedAt || 0);
      const used = Number(current.freeUsed || 0);
      tx.set(path, { ...current, freeUsed: startedAt && now - startedAt < FREE_WINDOW_MS ? Math.max(0, used - 1) : 0, updatedAt: now });
    }
  });
}
