import { getAgriculturalNews } from "./_lib/agricultural-news.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === "GET" && req.query?.service === "agricultural-news") {
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
