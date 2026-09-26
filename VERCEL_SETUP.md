# Shamba Vet — Vercel deployment

1. Import this project into Vercel.
2. Framework: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add `GEMINI_API_KEY` in Vercel Project Settings → Environment Variables.
6. Add the Firebase `VITE_*` variables if Firebase is configured through environment variables.
7. Redeploy after saving environment variables.
8. Test `/api/health`.
9. Test AI Vet from the website.

Do not put Gemini or M-PESA private secrets in `VITE_*` variables or browser code.
