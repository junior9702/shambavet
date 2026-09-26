export default function handler(req,res){
  res.status(200).json({
    ok:true,
    service:"Shamba Vet API",
    geminiConfigured:Boolean(process.env.GEMINI_API_KEY),
    geminiModel:"gemini-3.8-flash",
    geminiApi:"Interactions API",
    firebaseReady:true,
    mpesaReady:true
  });
}