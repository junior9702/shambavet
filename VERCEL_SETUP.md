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

## ShambaVet paid AI analysis + veterinarian directory

### PayHero
The AI assistant now gives exactly 2 free checks. The free-check counter is stored in the browser and does not reset on refresh; after 24 hours the two free checks become available again. After the free checks are used, Analyse opens PayHero. A paid analysis is unlocked only after the PayHero transaction reference is verified by `/api/payment-status`.

For automatic verification, add these Vercel environment variables:
- `PAYHERO_API_USERNAME` — PayHero API username
- `PAYHERO_API_PASSWORD` — PayHero API password
- `VITE_PAYHERO_CHANNEL_ID` — your PayHero payment channel ID
- `VITE_PAYHERO_AMOUNT=49`

PayHero's official payment-button integration supports a unique payment reference and success URL, which this build uses. Keep API credentials server-side; do not put them in `VITE_` variables.

### Firebase veterinarian admin
1. Enable Email/Password sign-in in Firebase Authentication.
2. Create the administrator user.
3. In Firestore create `admins/{ADMIN_USER_UID}` with `{ "enabled": true }`.
4. Deploy/apply `firestore.rules` from this project to your Firebase Firestore database.
5. Open ShambaVet → Admin Dashboard, sign in, then add veterinarian name, phone, WhatsApp, specialty, address, latitude and longitude.
6. The public Veterinarians page reads those records and displays pins on an OpenStreetMap map with Call, WhatsApp and Directions buttons.

The generated ShambaVet logo is installed as the home-page/header logo and as the PWA icon. The Install button opens the install prompt/instructions.
