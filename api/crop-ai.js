import { requireFirebaseUser } from "./_lib/firebase-rest.js";
import { reserveAIUsage, refundAIUsage } from "./_lib/ai-usage.js";

const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const TIMEOUT_MS = 22000;
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    assessment: { type: "string" },
    urgency: { type: "string" },
    recommendations: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    precautions: { type: "array", items: { type: "string" } }
  },
  required: ["assessment", "urgency", "recommendations", "questions", "precautions"]
};

async function requestGemini(model,key,input) {
  return fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({
      model,input,store:false,
      response_format:{type:"text",mime_type:"application/json",schema:RESPONSE_SCHEMA},
      system_instruction:"You are ShambaVet Crop Advisor, a cautious crop-health decision-support assistant for Kenyan farmers. Never claim certainty from symptoms or a photograph. Prioritise safe, locally appropriate, integrated pest management and qualified agricultural extension advice."
    }),
    signal:AbortSignal.timeout(TIMEOUT_MS)
  });
}

function extractOutput(data) {
  if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text;
  const parts=[];
  for(const step of Array.isArray(data?.steps)?data.steps:[])if(step?.type==="model_output"&&Array.isArray(step.content))for(const item of step.content)if(item?.type==="text"&&typeof item.text==="string")parts.push(item.text);
  return parts.join("\n").trim();
}

export default async function handler(req,res) {
  res.setHeader("Content-Type","application/json");
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"POST required"});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(500).json({error:"GEMINI_API_KEY is not configured in Vercel."});
  let user=null,reservation=null;
  try {
    user=await requireFirebaseUser(req);
    const body=req.body||{};
    const crop=String(body.crop||"").trim();
    const symptoms=String(body.symptoms||"").trim();
    const county=String(body.county||"Not supplied").trim().slice(0,100);
    const growthStage=String(body.growthStage||"Not supplied").trim().slice(0,100);
    if(!crop||!symptoms)return res.status(400).json({error:"Crop type and observed symptoms are required."});
    if(crop.length>100||symptoms.length>3000)return res.status(400).json({error:"Crop details are too long. Keep symptoms under 3,000 characters."});
    const prompt = [
      "Assess this crop problem for a farmer in Kenya. Treat the information as preliminary, not a confirmed diagnosis.",
      "Crop: "+crop,
      "County: "+county,
      "Growth stage: "+growthStage,
      "Observed symptoms: "+symptoms,
      "Explain plausible pest, disease, nutrient, water, weather or management causes without overstating certainty.",
      "Prioritise low-risk immediate actions and integrated pest management. Do not prescribe pesticide brands, chemical mixtures, application rates or harvest waiting periods.",
      "If a pesticide may be necessary, tell the farmer to consult a qualified extension officer/agronomist and follow the locally registered product label. Mention when a sample or in-person inspection is needed.",
      "Return JSON with: assessment (likely explanations and distinguishing signs), urgency (routine, prompt or urgent and why), recommendations (practical safe next steps), questions (useful follow-up questions), precautions (steps to prevent spread or avoid crop/food safety risks)."
    ].join("\n");
    const content=[{type:"text",text:prompt}];
    if(body.image?.mimeType&&body.image?.data){
      if(!/^image\/(jpeg|png|webp|gif)$/i.test(body.image.mimeType))return res.status(400).json({error:"Upload a JPG, PNG, WEBP or GIF crop photograph."});
      if(typeof body.image.data!=="string"||body.image.data.length>7000000)return res.status(400).json({error:"The crop photo is too large. Use an image under 5 MB."});
      content.push({type:"image",data:body.image.data,mime_type:body.image.mimeType});
    }
    reservation=await reserveAIUsage(user.uid);
    if(!reservation)return res.status(402).json({code:"PAYMENT_REQUIRED",error:"Your free AI consultations have been used. Open AI Vet to purchase another consultation for KSh 49. AI credits are shared across ShambaVet AI tools."});
    const input=[{type:"user_input",content}];
    let result=null,lastStatus=503,usedModel=null;
    for(let i=0;i<MODELS.length;i++){
      try{
        const response=await requestGemini(MODELS[i],key,input);
        result=await response.json().catch(()=>({}));
        if(response.ok){usedModel=MODELS[i];break;}
        lastStatus=response.status;
        if(![429,500,502,503,504].includes(response.status)||i===MODELS.length-1)break;
      }catch(error){
        lastStatus=error?.name==="TimeoutError"||error?.name==="AbortError"?504:503;
        if(i===MODELS.length-1)break;
      }
    }
    if(!usedModel){
      await refundAIUsage(user.uid,reservation).catch(()=>{});reservation=null;
      const status=lastStatus===504?504:[400,401,403,404].includes(lastStatus)?502:503;
      return res.status(status).json({error:lastStatus===429?"AI service is busy. Please wait and try again.":lastStatus===504?"Crop analysis took too long. Please try again.":"Crop analysis is temporarily unavailable. Please try again later.",providerStatus:lastStatus});
    }
    const output=extractOutput(result);
    let assessment;
    try{let cleaned=String(output).trim();const fence=String.fromCharCode(96).repeat(3);if(cleaned.startsWith(fence)){cleaned=cleaned.slice(fence.length).replace(/^json\s*/i,"").trim();if(cleaned.endsWith(fence))cleaned=cleaned.slice(0,-fence.length).trim();}assessment=JSON.parse(cleaned);}
    catch{await refundAIUsage(user.uid,reservation).catch(()=>{});reservation=null;return res.status(502).json({error:"The crop assessment could not be read. Please try again."});}
    reservation=null;
    return res.status(200).json({...assessment,modelUsed:result?.model||usedModel});
  }catch(error){
    if(user&&reservation)await refundAIUsage(user.uid,reservation).catch(()=>{});
    if(error?.status)return res.status(error.status).json({error:error.message||"Authentication or AI usage error."});
    if(error?.name==="TimeoutError"||error?.name==="AbortError")return res.status(504).json({error:"Crop analysis took too long. Please try again."});
    console.error("ShambaVet crop AI error:",error?.name||"Error");
    return res.status(500).json({error:"Crop analysis could not be completed. Please try again."});
  }
}
