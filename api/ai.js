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

const CROP_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" }, severity: { type: "string" }, confidence: { type: "string" },
    possibleCauses: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, likelihood: { type: "string" }, whyItFits: { type: "string" },
      signsToCheck: { type: "array", items: { type: "string" } }
    }, required: ["name", "likelihood", "whyItFits", "signsToCheck"] } },
    immediateActions: { type: "array", items: { type: "string" } },
    treatmentOptions: { type: "array", items: { type: "string" } },
    prevention: { type: "array", items: { type: "string" } },
    followUpQuestions: { type: "array", items: { type: "string" } },
    escalation: { type: "string" }, localNotes: { type: "string" }
  },
  required: ["summary", "severity", "confidence", "possibleCauses", "immediateActions", "treatmentOptions", "prevention", "followUpQuestions", "escalation", "localNotes"]
};

const CROP_SYSTEM_INSTRUCTION = [
  "You are ShambaVet Crop Advisor, a careful crop-production and plant-health decision-support assistant for farmers in Kenya.",
  "Give detailed practical guidance, not one generic sentence. Rank up to four plausible causes and explain the evidence for each.",
  "Use crop, growth stage, county, symptoms, field pattern, weather, soil and photo. State what is missing and ask targeted follow-up questions.",
  "Never claim certainty from a photo alone. Do not invent outbreaks, laboratory results, pesticide registrations, product names, application rates or harvest intervals.",
  "Give low-risk immediate actions first. For pesticides and fertilisers, require confirmation that the product is registered for the crop and problem and that its label and local extension guidance are followed. Do not prescribe unsupported chemical doses.",
  "Flag rapid spread, severe wilting, suspected invasive pests, poisoning or major crop loss for prompt county agricultural extension or plant-health officer support.",
  "Use plain language, Kenyan farming context and metric units. Distinguish observations, possibilities and recommendations."
].join(" ");

async function callGemini(model, key, input, schema = RESPONSE_SCHEMA, systemInstruction = "You are a careful veterinary decision-support assistant. Safety and veterinarian referral take priority over definitive diagnosis or prescribing.") {
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
        schema
      },
      system_instruction: systemInstruction
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
    const body = req.body || {};
    const isCrop = body.mode === "crop";
    const { animal, symptoms, duration, image } = body;
    let prompt = "";
    let responseSchema = RESPONSE_SCHEMA;
    let systemInstruction = "You are a careful veterinary decision-support assistant. Safety and veterinarian referral take priority over definitive diagnosis or prescribing.";

    if (isCrop) {
      const crop = String(body.crop || "").trim().slice(0, 100);
      if (!crop || typeof symptoms !== "string" || !symptoms.trim()) return res.status(400).json({ error: "Select a crop and describe what you are seeing." });
      if (symptoms.length > 5000) return res.status(400).json({ error: "Please keep the symptom description under 5,000 characters." });
      responseSchema = CROP_RESPONSE_SCHEMA;
      systemInstruction = CROP_SYSTEM_INSTRUCTION;
      prompt = [
        "Prepare a structured crop assessment for this farm case.",
        "Crop: " + crop,
        "Variety: " + String(body.variety || "Not provided").slice(0, 100),
        "Growth stage: " + String(body.stage || "Not provided").slice(0, 100),
        "County / area: " + String(body.county || "Not provided").slice(0, 100),
        "Symptoms and observations: " + symptoms,
        "When it started: " + String(duration || "Not provided").slice(0, 150),
        "Field pattern: " + String(body.pattern || "Not provided").slice(0, 200),
        "Recent weather / watering: " + String(body.weather || "Not provided").slice(0, 300),
        "Soil / field conditions: " + String(body.soil || "Not provided").slice(0, 300),
        "Previous actions or inputs: " + String(body.previousActions || "Not provided").slice(0, 500),
        "Additional farmer observations / follow-up: " + String(body.followUp || "None").slice(0, 2000),
        "Previous assessment to refine (if any): " + JSON.stringify(body.previousAssessment || {}).slice(0, 5000),
        "For follow-ups, explain what the new information changes, what remains uncertain and what to check next. Do not merely repeat the previous answer.",
        "Provide up to four ranked possible causes, field checks, safe immediate actions, cautious treatment options, prevention, targeted questions, escalation advice and locally relevant notes."
      ].join("\n");
    } else {
      if (!animal || !symptoms) return res.status(400).json({ error: "Animal and symptoms are required." });
      if (typeof symptoms !== "string" || symptoms.length > 5000) return res.status(400).json({ error: "Please keep the symptom description under 5,000 characters." });
      prompt = `You are Shamba Vet AI, a veterinary decision-support assistant for farmers in Kenya.
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
    }

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
        const response = await callGemini(model, key, input, responseSchema, systemInstruction);
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
    if (error?.status) return res.status(error.status).json({ error: error.message || "Authentication or quota service error." });
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({ error: "Gemini took too long to respond. Please try again." });
    }
    return res.status(500).json({ error: "The AI service could not complete this request. Please try again." });
  }
}
