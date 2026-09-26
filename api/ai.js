export default async function handler(req,res){
  res.setHeader("Content-Type","application/json");
  if(req.method!=="POST") return res.status(405).json({error:"POST required"});
  const key=process.env.GEMINI_API_KEY;
  if(!key) return res.status(500).json({error:"GEMINI_API_KEY is not configured in Vercel."});
  try{
    const {animal,symptoms,duration,image}=req.body||{};
    if(!animal||!symptoms) return res.status(400).json({error:"Animal and symptoms are required."});
    const prompt=`You are Shamba Vet AI, a veterinary decision-support assistant for farmers in Kenya.
Animal: ${animal}
Symptoms: ${symptoms}
Duration: ${duration||"not provided"}

Give cautious preliminary veterinary decision support. Do not claim a definitive diagnosis.
Identify possible conditions to discuss with a veterinarian, urgency, safe immediate precautions,
and medicine information only at a high level. Never give an unsafe or unverified dose.
For livestock, milk/meat withdrawal periods and prescription requirements must be verified by
a veterinarian and the local product label. Recommend urgent veterinary care for emergencies.

Return ONLY valid JSON:
{"possible":"...","urgency":"...","medicine":"...","questions":["...","..."],"precautions":["..."]}
Keep it concise and farmer-friendly.`;
    const parts=[{text:prompt}];
    if(image?.mimeType&&image?.data) parts.push({inline_data:{mime_type:image.mimeType,data:image.data}});
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({contents:[{parts}],generationConfig:{temperature:.2,maxOutputTokens:900}})
    });
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||"Gemini API request failed."});
    let text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
    text=text.replace(/^```json\s*/i,"").replace(/\s*```$/,"").trim();
    let result;
    try{result=JSON.parse(text)}catch{
      result={possible:text||"No usable AI response.",urgency:"Veterinary assessment recommended",
        medicine:"Discuss medicines with a qualified veterinarian before administration.",
        questions:["Age","Weight","Temperature","Pregnancy/lactation","Vaccination/deworming history"],
        precautions:["Provide clean water and seek professional veterinary assessment."]};
    }
    return res.status(200).json(result);
  }catch(e){return res.status(500).json({error:e?.message||"Gemini request failed."});}
}