import { firestoreGet, requireFirebaseUser, sendApiError } from './_lib/firebase-rest.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  try {
    const user = await requireFirebaseUser(req);
    const [employer, seeker] = await Promise.all([
      firestoreGet('jobAdvertiserSubscriptions/' + user.uid),
      firestoreGet('jobSeekerSubscriptions/' + user.uid)
    ]);
    const now = Date.now();
    const active = value => !!value?.active && Number(value.expiresAt || 0) > now;
    return res.status(200).json({
      employer: employer ? { ...employer, active: active(employer) } : { active: false },
      seeker: seeker ? { ...seeker, active: active(seeker) } : { active: false }
    });
  } catch (error) { return sendApiError(res, error); }
}
