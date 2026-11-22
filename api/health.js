import { getAgriculturalNews } from "./_lib/agricultural-news.js";
import { requireFirebaseUser, firestoreGet, firestoreListCollection } from "./_lib/firebase-rest.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === "GET" && req.query?.service === "jobs-public") {
    try {
      const docs = await firestoreListCollection("jobListings", 500);
      const jobs = docs.filter(x => x.status === "approved").map(x => ({
        id: x.id, title: x.title || "", organization: x.organization || "",
        category: x.category || "", county: x.county || "",
        workType: x.workType || "", workplace: x.workplace || "",
        createdAt: x.createdAt || null, status: x.status
      })).sort((a,b) => Number(b.createdAt?.seconds || b.createdAt || 0) - Number(a.createdAt?.seconds || a.createdAt || 0));
      return res.status(200).json({ jobs });
    } catch (error) { return res.status(500).json({ error: "Could not load public job listings." }); }
  }
  if (req.method === "GET" && req.query?.service === "jobs-status") {
    try {
      const user = await requireFirebaseUser(req);
      const [employer, seeker] = await Promise.all([
        firestoreGet("jobAdvertiserSubscriptions/" + user.uid),
        firestoreGet("jobSeekerSubscriptions/" + user.uid)
      ]);
      const active = value => !!value?.active && Number(value.expiresAt || 0) > Date.now();
      return res.status(200).json({
        employer: employer ? { ...employer, active: active(employer) } : { active: false },
        seeker: seeker ? { ...seeker, active: active(seeker) } : { active: false }
      });
    } catch (error) { return res.status(Number(error.status) || 500).json({ error: "Could not load subscription status." }); }
  }
  if (req.method === "GET" && req.query?.service === "jobs-unlocked") {
    try {
      const user = await requireFirebaseUser(req);
      const sub = await firestoreGet("jobSeekerSubscriptions/" + user.uid);
      if (!sub?.active || Number(sub.expiresAt || 0) <= Date.now()) return res.status(403).json({ error: "An active job seeker subscription is required." });
      const docs = await firestoreListCollection("jobListings", 500);
      const jobs = docs.filter(x => x.status === "approved").map(x => ({
        id: x.id, description: x.description || "", requirements: x.requirements || "",
        salary: x.salary || "", deadline: x.deadline || "",
        applicationEmail: x.applicationEmail || "", applicationPhone: x.applicationPhone || "",
        applicationUrl: x.applicationUrl || ""
      }));
      return res.status(200).json({ jobs, expiresAt: sub.expiresAt });
    } catch (error) { return res.status(Number(error.status) || 500).json({ error: "Could not unlock job details." }); }
  }
  if (req.method === "GET" && req.query?.service === "agricultural-news") {
    let isDeveloperAdmin = false;
    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    if (/^Bearer\s+/i.test(String(authHeader))) {
      try {
        const user = await requireFirebaseUser(req);
        const admin = await firestoreGet("admins/" + user.uid);
        isDeveloperAdmin = Boolean(admin?.enabled && admin?.role === "developer");
      } catch (error) {
        if (Number(error.status) !== 401) return res.status(Number(error.status) || 500).json({ error: "Could not verify your ShambaVet account." });
      }
    }
    // Agricultural news applies the same admin check to every response shape.
    // Do not decorate or expose source metadata in this route layer.
    req.newsAdmin = isDeveloperAdmin;
    return getAgriculturalNews(req, res);
  }
  return res.status(200).json({
    ok: true,
    service: "Shamba Vet API",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    primaryModel: "gemini-3.8-flash",
    fallbackModel: "gemini-3.5-flash-lite",
    geminiApi: "Interactions API",
    firebaseReady: true,
    mpesaReady: true
  });
}
