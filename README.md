# ShambaVet — Kenya Agricultural Hub

A Vite + React + Firebase application prepared for Vercel deployment. This release expands the existing ShambaVet veterinary and marketplace platform with farmer profiles, agricultural organization registration and verification, extension field-visit reports, farmer training events, crop production logs, feed-budget calculations and farm-structure planning.

**Training certificates are intentionally not included.** Training is for practical learning, demonstrations and event participation only.

## Included modules

- Existing ShambaVet home, veterinary assistant UI, animal records, health records, veterinarian directory and registration, emergency information, marketplace, crop assistant and admin tools.
- Farmer profile and farm information, including email/password account linking so a temporary anonymous session can be upgraded without losing the current Firebase UID and its records.
- Agricultural organization applications for government departments, county departments, NGOs, cooperatives, farmer groups, research institutions, training institutions and agribusinesses.
- Public directory of approved organizations only.
- Field visit and extension reports, county selection, optional GPS capture and optional image upload to Firebase Storage.
- Published farmer training / field events and farmer interest registration.
- Admin workspace to approve/reject organization applications, review field reports and publish events.
- Livestock performance records for milk, eggs, weights, births, mortality and harvests.
- Crop planting and production records.
- Feed quantity and cost estimator. It is a budgeting calculator, not a ration-formulation or veterinary prescription tool.
- Farm structure floor-area, perimeter and preliminary budget calculator. It is not an engineering design or building approval.
- Firestore and Storage rules for owner/admin access.

## Requirements

- Node.js 20 or newer
- npm
- Firebase project with Authentication, Firestore and Storage enabled
- Vercel account for hosting
- Optional Gemini API key for the server-side AI veterinary endpoint

## Local installation (Windows PowerShell)

1. Extract the ZIP.
2. Open PowerShell in the extracted `shambavet-main` folder.
3. Run:

```powershell
npm ci
npm run dev
```

4. Open the local URL printed by Vite (usually `http://localhost:5173`).
5. Before deployment, run:

```powershell
npm run build
```

The production output is `dist/`.

## Firebase setup

This project includes a Firebase web configuration for project `agrovet-fa09a` in `src/firebase.js` and `.firebaserc`. Confirm that you own/control this project and that the Firebase web app configuration still matches your console. Firebase web API keys are public client identifiers; never place service-account private keys in this frontend.

In Firebase Console:

1. Authentication → Sign-in method: enable **Anonymous** and **Email/Password**.
2. Firestore Database: create/enable the database.
3. Storage: create/enable the default bucket.
4. Ensure the storage bucket configured in `src/firebase.js` matches the bucket shown in Firebase Console.

Then in PowerShell:

```powershell
firebase login
firebase use agrovet-fa09a
firebase deploy --only firestore:rules,storage
```

If using another Firebase project, update `.firebaserc` and `src/firebase.js` with that project's web configuration before deploying. Do not copy a private service account key into the frontend.

### Create the first platform administrator

1. Firebase Console → Authentication → Add user: create a trusted administrator email/password account.
2. Copy that user's **UID**.
3. Firestore → create collection `admins`.
4. Create a document whose document ID is exactly that UID.
5. Add field `enabled` with Boolean value `true`.
6. Sign in to ShambaVet's **Institution Admin** or existing **Admin Dashboard** using that account.

Never create an admin document for an untrusted user. Admin permissions are controlled by the Firestore `admins/{uid}` record.

## Vercel deployment

### Git-based deployment

1. Push the extracted project folder to a private or public Git repository you control.
2. In Vercel, select **Add New → Project** and import that repository.
3. Framework preset: **Vite**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Install command: `npm ci`.
7. Add `GEMINI_API_KEY` only if using the AI endpoint. Do not add the key as a `VITE_` variable.
8. Deploy.

### Vercel CLI deployment

```powershell
npm install -g vercel
vercel login
vercel
vercel --prod
```

The included `vercel.json` configures Vite output and SPA routing while leaving `/api/*` serverless routes available.

## Optional Gemini AI

The AI route is `api/ai.js`. Add `GEMINI_API_KEY` in Vercel → Project → Settings → Environment Variables, then redeploy. The AI endpoint is optional; the core farmer, organization, field visit, event, crop record and calculator modules use Firebase.

## Important workflow boundaries

- Organization submissions are **pending** until an administrator verifies them. A submitted organization is not a government-approved or legally accredited institution.
- Only records with `status: approved` are shown in the public organization directory.
- Only published training events appear to farmers.
- Field visit GPS capture is optional and should only be used with the host farmer's knowledge and consent.
- Visit photographs are optional, restricted by Storage rules and limited to images under 5 MB.
- Farmer records are private to their Firebase account. Anonymous accounts are device/session dependent; use the Farm Profile page to link an email/password account before changing devices.
- The feed tool estimates quantity and cost from user-entered values. It does not decide safe feeding rates or balance nutrients.
- The farm structure tool estimates dimensions and a user-entered floor-area budget only. Obtain qualified engineering, animal-welfare and county approvals before construction.
- No training certificate feature exists in this release.

## Firestore collections

`farmerProfiles`, `organizationApplications`, `organizations`, `fieldVisitReports`, `trainingEvents`, `trainingRegistrations`, existing `veterinarians`, `vetApplications`, `marketplaceProducts`, `admins`, and user-owned subcollections such as `users/{uid}/animals`, `users/{uid}/cases`, `users/{uid}/productionRecords`, `users/{uid}/cropRecords` and `users/{uid}/feedPlans`.

## Troubleshooting

- `Missing or insufficient permissions`: deploy the included Firestore and Storage rules; check that the user is signed in and that the administrator UID has `admins/{uid}.enabled == true`.
- `auth/operation-not-allowed`: enable Anonymous and Email/Password providers in Firebase Authentication.
- Upload errors: enable Firebase Storage and verify the configured bucket.
- Vercel API errors: add `GEMINI_API_KEY` if using AI; other app sections do not require it.
- If the browser shows an old version after deployment, hard-refresh or clear the installed PWA's cached site data; the service-worker cache version is incremented in this release.


## Agricultural Network expansion

The Agricultural Network adds the following moderated services:

- County weather forecasts through Open-Meteo. Forecast locations represent county-level reference locations and are not farm-specific measurements.
- AI Crop Advisor with optional crop photographs, county and growth-stage context, cautious integrated-pest-management guidance, and private assessment history. It shares the existing AI consultation allowance and requires the existing `GEMINI_API_KEY` configuration.
- Veterinary consultation requests. Requests remain pending until an authorised administrator contacts the farmer; submitting a request does not confirm an appointment.
- Farmer community posts, held for administrator moderation before publication.
- Agricultural jobs, internships, grants, tenders, training and partnership listings, held for review before publication.
- Community-submitted market price observations. These are labelled as indicative reports and are not official market quotations.
- Administrator moderation queues for appointment requests, community posts, opportunities and market observations.

### New Firestore collections

- `vetAppointmentRequests`
- `communityPosts`
- `agriculturalOpportunities`
- `marketPriceReports`

The matching Firestore rules restrict private appointment requests to their owner and authorised administrators. Public community, opportunity and market entries are visible only after an administrator changes their status to `published`. Only authorised developer administrators can moderate records.

### Operational notes

- Weather forecasts require an internet connection and are supplied by Open-Meteo.
- Appointment requests require manual follow-up by the ShambaVet team until a verified professional scheduling workflow is implemented.
- Market observations are community submitted and should be independently confirmed before commercial decisions.
- New modules use the existing Firebase Authentication and Firestore setup; no new paid service or API key is required for these additions.
