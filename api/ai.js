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

Give cautious preliminary veterinary decision support. Do NOT claim a definitive diagnosis.
Identify possible conditions to discuss with a veterinarian, urgency, safe immediate precautions,
and medicine information only at a high level. Never provide an unsafe or unverified dose.
For livestock, milk/meat withdrawal periods and prescription requirements must be verified
by a qualified veterinarian and the local product label. Recommend urgent veterinary care
for emergencies.

Return ONLY valid JSON:
{"possible":"...","urgency":"...","medicine":"...","questions":["...","..."],"precautions":["..."]}`;

    const input=[{type:"text",text:prompt}];

    if(image?.mimeType && image?.data){
      input.push({type:"image",data:image.data,mime_type:image.mimeType});
    }

    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({
        model:"gemini-3.8-flash",
        input,
        store:false,
        system_instruction:"You are a careful veterinary decision-support assistant. Safety and veterinarian referral take priority over definitive diagnosis or prescribing."
      })
    });

    const data=await response.json();

    if(!response.ok){
      return res.status(response.status).json({
        error:data?.error?.message||"Gemini Interactions API request failed."
      });
    }

    let text=data?.output_text||"";
    if(!text && Array.isArray(data?.steps)){
      for(const step of data.steps){
        if(step?.type==="model_output" && Array.isArray(step.content)){
          text+=step.content.filter(x=>x?.type==="text").map(x=>x.text||"").join("");
        }
      }
    }

    text=String(text).replace(/^```json\s*/i,"").replace(/\s*```$/,"").trim();

    let result;
    try{result=JSON.parse(text)}catch{
      result={
        possible:text||"Gemini returned no usable assessment.",
        urgency:"Veterinary assessment recommended",
        medicine:"Discuss medicines with a qualified veterinarian before administration.",
        questions:["Age","Weight","Temperature","Pregnancy/lactation","Vaccination/deworming history"],
        precautions:["Provide clean water and seek professional veterinary assessment."]
      };
    }

    return res.status(200).json(result);
  }catch(error){
    return res.status(500).json({error:error?.message||"Unable to contact Gemini."});
  }
}