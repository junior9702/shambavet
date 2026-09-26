# AgroVet

Mobile-first AgroVet & Veterinary Assistance platform foundation.

## Included
- Farmer, veterinarian and admin portal UI
- Animal profiles and health records
- AI veterinary assistant demo workflow
- Medication guidance with safety messaging
- Veterinarian case handoff
- Emergency assistance
- Marketplace foundation
- Crop assistant foundation
- M-PESA-ready configuration placeholders

## Run
```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Production architecture
The UI is intentionally ready to connect to a secure backend. API keys, veterinary medication databases, authentication, PostgreSQL and M-PESA credentials must be handled server-side in production.


## Firebase
This version is connected to the AgroVet Firebase project:
- Firebase App
- Authentication SDK
- Cloud Firestore SDK
- Cloud Storage SDK
- Analytics SDK (optional/auto-detected)

Before production use, enable the Firebase products you need in the Firebase Console and configure secure Firestore/Storage rules. Never put server credentials or Admin SDK service-account keys in the frontend.


## Shamba Vet & Feed Calculator v2

This version narrows the product to three farmer actions:
1. Select Kuku, Goat or Cow and describe symptoms.
2. Receive AI-assisted preliminary guidance and escalate to a veterinarian.
3. Calculate a starting feed-planning estimate from live weight.

Business model foundation:
- 3 free checks per device, then KSh 49/check.
- M-PESA STK integration point is designed for a secure backend/Firebase Function.
- Agrovet partner referral/commission flow.
- Ad placement is included. Google AdMob itself is for native Android/iOS apps; the web UI contains an ad slot and can be wrapped with Capacitor/native Google Mobile Ads for production.

AI safety:
- The browser must not contain a private AI provider key.
- Production AI should run through a secure backend/Firebase Function.
- Medicine information is guidance only; final medicine, dose, duration and withdrawal period must be verified by a licensed veterinarian.
- Feed figures are planning estimates and should be configured/reviewed by livestock nutrition professionals for the target species and production stage.


## V3 — Any Animal
The veterinary check now accepts any animal. It includes common livestock, poultry, pets, fish, bees, working animals and an **Other animal** option where the farmer can type any species. Species-specific AI knowledge can be expanded through the secure backend without changing the farmer UI.

## V4 complete foundation
Farmer Portal, animal registration, health-records foundation, AI veterinary assistant, photo/video upload UI, safety-controlled medicine guidance, veterinarian handoff and portal, emergency assistance, AgroVet marketplace, admin dashboard, crop assistant, M-PESA-ready environment, Vercel-ready Vite setup, and responsive mobile UI.

Production note: connect AI and M-PESA through secure server/Firebase Functions. Do not put private AI or M-PESA credentials in the browser.

## Gemini AI setup
The AI Veterinary Assistant calls `/api/ai`; the Gemini key is server-side and is never placed in the browser. In local development create `.env.local` and set `GEMINI_API_KEY=your_key`. On Vercel add `GEMINI_API_KEY` under Project Settings → Environment Variables. The route uses Google's Gemini `generateContent` endpoint and supports a single uploaded animal image.

## Local Gemini API fix
V6 includes a Vite development middleware for `/api/ai`. This prevents the browser from receiving an HTML/empty response from Vite and then failing with `Unexpected end of JSON input`.

Create `.env.local`:
`GEMINI_API_KEY=YOUR_KEY`

Then restart the dev server:
`npm run dev`

Never put the Gemini key in `src/main.jsx`.

## Vercel production
This version targets Vercel directly. The Gemini function is `api/ai.js`; Vercel runs it as a serverless function. Local-only API middleware has been removed.
