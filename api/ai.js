import { requireFirebaseUser } from './_lib/firebase-rest.js';
import { reserveAIUsage, refundAIUsage } from './_lib/ai-usage.js';

const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const REQUEST_TIMEOUT_MS = 22000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    possible: { type: "string" },
    urgency: { type: "string" },
    medicine: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    precautions: { type: "array", items: { type: "string" } }
  },
  required: ["possible", "urgency", "medicine", "questions", "precautions"]
};

async function callGemini(model, key, input) {
  return fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input,
      store: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_SCHEMA
      },
      system_instruction: "You are a careful veterinary decision-support assistant. Safety and veterinarian referral take priority over definitive diagnosis or prescribing."
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
}

function extractOutput(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const step of Array.isArray(data?.steps) ? data.steps : []) {
    if (step?.type === "model_output" && Array.isArray(step.content)) {
      for (const item of step.content) {
        if (item?.type === "text" && typeof item.text === "string") parts.push(item.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function friendlyApiError(status, message) {
  const detail = String(message || "").replace(/\s+/g, " ").slice(0, 300);
  if (status === 400) return "Gemini rejected the request. Please check the information and try again. " + detail;
  if (status === 401 || status === 403) return "Gemini API authentication failed. The ShambaVet administrator needs to check the GEMINI_API_KEY and its API access.";
  if (status === 404) return "The configured Gemini model or API endpoint was not found. The ShambaVet administrator needs to check the model configuration.";
  if (status === 429) return "Gemini rate limit or quota reached. Please wait a moment and try again.";
  if (status === 504) return "Gemini took too long to respond. Please try again.";
  if (status >= 500) return "Google Gemini is temporarily unavailable. Please try again shortly.";
  return "Gemini request failed (HTTP " + status + "). " + detail;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY is not configured in Vercel." });

  let user = null;
  let reservation = null;
  try {
    user = await requireFirebaseUser(req);
    const { animal, symptoms, duration, image } = req.body || {};
    if (!animal || !symptoms) return res.status(400).json({ error: "Animal and symptoms are required." });
    if (typeof symptoms !== "string" || symptoms.length > 5000) {
      return res.status(400).json({ error: "Please keep the symptom description under 5,000 characters." });
    }

    const prompt = `You are Shamba Vet AI, a veterinary decision-support assistant for farmers in Kenya.
Animal: ${String(animal).slice(0, 100)}
Symptoms: ${symptoms}
Duration: ${String(duration || "not provided").slice(0, 200)}

Give cautious preliminary veterinary decision support. Do NOT claim a definitive diagnosis. Identify possible conditions to discuss with a veterinarian, urgency, safe immediate precautions, and medicine information only at a high level. Never provide an unsafe or unverified dose. For livestock, milk/meat withdrawal periods and prescription requirements must be verified by a qualified veterinarian and the local product label. Recommend urgent veterinary care for emergencies.

Return a structured JSON assessment with:
- possible: possible causes, clearly marked as possibilities
- urgency: urgency level and when to seek veterinary care
- medicine: safe high-level medicine guidance; do not prescribe a dose
- questions: useful follow-up questions for the farmer
- precautions: safe immediate steps the farmer can take`;

    const content = [{ type: "text", text: prompt }];
    if (image?.mimeType && image?.data) {
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(image.mimeType)) {
        return res.status(400).json({ error: "Please upload a JPG, PNG, WEBP or GIF animal photo." });
      }
      if (typeof image.data !== "string" || image.data.length > 7_000_000) {
        return res.status(400).json({ error: "The image is too large. Please use an image under 5 MB." });
      }
      content.push({ type: "image", data: image.data, mime_type: image.mimeType });
    }

    reservation = await reserveAIUsage(user.uid);
    if (!reservation) {
      return res.status(402).json({
        code: "PAYMENT_REQUIRED",
        error: "Your two free AI consultations for this 24-hour period have been used. Pay KSh 49 to unlock one more consultation."
      });
    }

    // Gemini Interactions expects text and image parts inside user_input.content.
    const input = [{ type: "user_input", content }];
    let lastStatus = 0;
    let lastMessage = "";
    let data = null;
    let usedModel = null;

    // Each model gets one bounded attempt; no unbounded retry loop.
    for (let index = 0; index < MODELS.length; index++) {
      const model = MODELS[index];
      try {
        const response = await callGemini(model, key, input);
        data = await response.json().catch(() => ({}));
        if (response.ok) {
          usedModel = model;
          break;
        }
        lastStatus = response.status;
        lastMessage = data?.error?.message || "Gemini request failed.";
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (!retryable || index === MODELS.length - 1) break;
        await sleep(350);
      } catch (error) {
        lastStatus = error?.name === "TimeoutError" || error?.name === "AbortError" ? 504 : 503;
        lastMessage = lastStatus === 504 ? "Gemini request timed out." : "Network request to Gemini failed.";
        if (index === MODELS.length - 1) break;
        await sleep(350);
      }
    }

    if (!usedModel) {
      await refundAIUsage(user.uid, reservation).catch(() => {});
      reservation = null;
      const status = lastStatus || 503;
      const clientStatus = status === 400 ? 400 : status === 401 || status === 403 || status === 404 ? 502 : status === 504 ? 504 : 503;
      return res.status(clientStatus).json({
        error: friendlyApiError(status, lastMessage),
        providerStatus: status
      });
    }

    const output = extractOutput(data);
    let result;
    try {
      const cleaned = String(output).replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      await refundAIUsage(user.uid, reservation).catch(() => {});
      reservation = null;
      return res.status(502).json({ error: "Gemini responded, but its assessment could not be read. Please try again." });
    }

    result.modelUsed = data?.model || usedModel;
    reservation = null;
    return res.status(200).json(result);
  } catch (error) {
    if (user && reservation) await refundAIUsage(user.uid, reservation).catch(() => {});
    console.error("ShambaVet Gemini API error:", error?.name || "Error");
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({ error: "Gemini took too long to respond. Please try again." });
    }
    return res.status(500).json({ error: "The AI service could not complete this request. Please try again." });
  }
}
