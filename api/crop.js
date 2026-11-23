import { requireFirebaseUser } from './_lib/firebase-rest.js';
import { reserveAIUsage, refundAIUsage } from './_lib/ai-usage.js';

const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const TIMEOUT_MS = 28000;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    severity: { type: "string" },
    confidence: { type: "string" },
    possibleCauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          likelihood: { type: "string" },
          whyItFits: { type: "string" },
          signsToCheck: { type: "array", items: { type: "string" } }
        },
        required: ["name", "likelihood", "whyItFits", "signsToCheck"]
      }
    },
    immediateActions: { type: "array", items: { type: "string" } },
    treatmentOptions: { type: "array", items: { type: "string" } },
    prevention: { type: "array", items: { type: "string" } },
    followUpQuestions: { type: "array", items: { type: "string" } },
    escalation: { type: "string" },
    localNotes: { type: "string" }
  },
  required: [
    "summary", "severity", "confidence", "possibleCauses",
    "immediateActions", "treatmentOptions", "prevention",
    "followUpQuestions", "escalation", "localNotes"
  ]
};

function extractOutput(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const step of Array.isArray(data?.steps) ? data.steps : []) {
    if (step?.type === "model_output" && Array.isArray(step.content)) {
      for (const item of step.content) if (item?.type === "text" && typeof item.text === "string") parts.push(item.text);
    }
  }
  return parts.join("\n").trim();
}

async function callModel(model, key, input) {
  return fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input,
      store: false,
      response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
      system_instruction: [
        "You are ShambaVet Crop Advisor, a careful crop-production and plant-health decision-support assistant for farmers in Kenya.",
        "Give a useful, detailed, practical answer, not a single generic sentence. Rank up to four plausible causes and explain what evidence supports or weakens each.",
        "Use the supplied crop, growth stage, county, symptoms, field pattern, weather, soil and photo. If information is missing, say so and ask targeted follow-up questions.",
        "Never claim certainty from a photo alone. Do not invent local outbreaks, laboratory results, pesticide registrations, product names, application rates, or harvest intervals.",
        "Give low-risk immediate actions first. For pesticides and fertilisers, advise the farmer to confirm the product is registered for that crop and problem, and follow its label and local extension guidance. Do not prescribe unsupported chemical doses.",
        "Flag urgent spread, severe wilting, suspected invasive pests, poisoning, or major crop loss for prompt county agricultural extension or plant-health officer support.",
        "Use plain language, Kenyan farming context and metric units. Distinguish observations, possibilities and recommendations."
      ].join(" ")
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "The crop AI service is not configured. The ShambaVet administrator must add GEMINI_API_KEY in Vercel." });

  let user = null;
  let reservation = null;
  try {
    user = await requireFirebaseUser(req);
    const body = req.body || {};
    const crop = String(body.crop || "").trim().slice(0, 100);
    const symptoms = String(body.symptoms || "").trim();
    if (!crop || !symptoms) return res.status(400).json({ error: "Select a crop and describe what you are seeing." });
    if (symptoms.length > 5000) return res.status(400).json({ error: "Please keep the symptom description under 5,000 characters." });

    const image = body.image;
    const content = [{
      type: "text",
      text: [
        "Prepare a structured crop assessment for this farm case.",
        "Crop: " + crop,
        "Variety: " + String(body.variety || "Not provided").slice(0, 100),
        "Growth stage: " + String(body.stage || "Not provided").slice(0, 100),
        "County / area: " + String(body.county || "Not provided").slice(0, 100),
        "Symptoms and observations: " + symptoms,
        "When it started: " + String(body.duration || "Not provided").slice(0, 150),
        "Field pattern: " + String(body.pattern || "Not provided").slice(0, 200),
        "Recent weather / watering: " + String(body.weather || "Not provided").slice(0, 300),
        "Soil / field conditions: " + String(body.soil || "Not provided").slice(0, 300),
        "Previous actions or inputs: " + String(body.previousActions || "Not provided").slice(0, 500),
        "Provide up to four ranked possible causes, field checks to distinguish them, safe immediate actions, cautious treatment options, prevention, targeted follow-up questions, escalation advice and locally relevant notes."
      ].join("\n")
    }];

    if (image?.mimeType && image?.data) {
      if (!/^image\/(jpeg|png|webp)$/i.test(image.mimeType)) return res.status(400).json({ error: "Upload a JPG, PNG or WEBP crop photo." });
      if (typeof image.data !== "string" || image.data.length > 7_000_000) return res.status(400).json({ error: "The crop photo is too large. Use an image under 5 MB." });
      content.push({ type: "image", data: image.data, mime_type: image.mimeType });
    }

    reservation = await reserveAIUsage(user.uid);
    if (!reservation) return res.status(402).json({
      code: "PAYMENT_REQUIRED",
      error: "Your two free AI checks for this 24-hour period have been used. Open AI Vet to add another KSh 49 AI credit, then return to Crop Assistant."
    });

    const input = [{ type: "user_input", content }];
    let lastStatus = 0, lastMessage = "", data = null, usedModel = null;
    for (let i = 0; i < MODELS.length; i++) {
      try {
        const response = await callModel(MODELS[i], process.env.GEMINI_API_KEY, input);
        data = await response.json().catch(() => ({}));
        if (response.ok) { usedModel = MODELS[i]; break; }
        lastStatus = response.status;
        lastMessage = data?.error?.message || "Gemini request failed.";
        if (![429, 500, 502, 503, 504].includes(response.status) || i === MODELS.length - 1) break;
      } catch (error) {
        lastStatus = error?.name === "TimeoutError" || error?.name === "AbortError" ? 504 : 503;
        lastMessage = "The crop AI provider did not respond.";
        if (i === MODELS.length - 1) break;
      }
    }

    if (!usedModel) {
      await refundAIUsage(user.uid, reservation).catch(() => {});
      reservation = null;
      const message = lastStatus === 429 ? "Crop AI is busy or its provider quota is reached. Please try again shortly."
        : lastStatus === 504 ? "Crop AI took too long to respond. Your AI credit has been returned; please try again."
        : lastStatus === 401 || lastStatus === 403 ? "Crop AI authentication failed. The ShambaVet administrator must check GEMINI_API_KEY."
        : "Crop AI is temporarily unavailable. Your AI credit has been returned; please try again.";
      return res.status(lastStatus === 504 ? 504 : 503).json({ error: message, providerStatus: lastStatus });
    }

    let result;
    try {
      const output = extractOutput(data).replace(/^\x60\x60\x60json\s*/i, "").replace(/\s*\x60\x60\x60$/, "").trim();
      result = JSON.parse(output);
    } catch {
      await refundAIUsage(user.uid, reservation).catch(() => {});
      reservation = null;
      return res.status(502).json({ error: "Crop AI returned an unreadable assessment. Your AI credit has been returned; please try again." });
    }

    reservation = null;
    return res.status(200).json({ ...result, modelUsed: data?.model || usedModel });
  } catch (error) {
    if (user && reservation) await refundAIUsage(user.uid, reservation).catch(() => {});
    console.error("ShambaVet crop assistant error:", error?.name || "Error");
    if (error?.status) return res.status(error.status).json({ error: error.message || "Authentication or usage service error." });
    return res.status(500).json({ error: "The crop assessment could not be completed. Please try again." });
  }
}
