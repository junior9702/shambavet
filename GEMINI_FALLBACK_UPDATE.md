# Gemini fallback
Primary: `gemini-3.8-flash`
Fallback: `gemini-3.5-flash-lite`

The API retries temporary 429/5xx responses once, then automatically tries the fallback model. Both models support image input. The Gemini key remains server-side in Vercel.
