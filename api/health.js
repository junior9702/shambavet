import { getAgriculturalNews } from "./_lib/agricultural-news.js";
import { requireFirebaseUser, firestoreGet } from "./_lib/firebase-rest.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
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
