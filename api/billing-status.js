import { firestoreGet, requireFirebaseUser, sendApiError } from './_lib/firebase-rest.js';
import { getAIUsage } from './_lib/ai-usage.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  try {
    const user = await requireFirebaseUser(req);
    const usage = await getAIUsage(user.uid);
    const account = await firestoreGet('aiAccounts/' + user.uid) || {};
    return res.status(200).json({
      ...usage,
      freeChecksPerWindow: 2,
      freeWindowHours: 24,
      paidCredits: Math.max(0, Number(account.paidCredits || 0))
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}
