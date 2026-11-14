# ShambaVet deployment checklist

## Before Vercel
- [ ] Node.js 20+ installed
- [ ] `npm ci` completes
- [ ] `npm run build` completes and creates `dist/`
- [ ] Firebase project ownership/configuration confirmed
- [ ] Anonymous and Email/Password authentication enabled
- [ ] Firestore created
- [ ] Firebase Storage bucket created
- [ ] Firestore and Storage rules deployed
- [ ] Trusted admin Email/Password account created
- [ ] `admins/{adminUid}` document created with Boolean `enabled: true`
- [ ] `GEMINI_API_KEY` added to Vercel only if AI is required

## After deployment
- [ ] Home page loads on desktop and mobile
- [ ] Farmer account can be linked to email/password
- [ ] Farmer profile saves and reloads
- [ ] Organization application submits and remains pending
- [ ] Admin can approve/reject organization application
- [ ] Approved organization appears in directory
- [ ] Field visit report submits
- [ ] Optional GPS capture works after user consent
- [ ] Optional image upload works with an image smaller than 5 MB
- [ ] Admin can view submitted field visit reports
- [ ] Admin can publish a training event
- [ ] Published event appears in Farmer Training
- [ ] Farmer can register interest in an event
- [ ] Livestock and crop records save under the signed-in user
- [ ] Feed and farm structure calculations produce expected totals
- [ ] Existing veterinary and marketplace pages still load

## Known boundaries in this release
- Organization applications are manually reviewed by the ShambaVet platform admin. No automated government registry verification is performed.
- Organization staff subaccounts, QR attendance check-in and county-specific delegated admin roles are not included yet.
- Training certificates are not included.
- AI requires a valid Gemini API key in Vercel; it is not required for the core Firebase modules.
- PayHero and payment verification must be tested with the merchant's actual PayHero configuration before accepting real payments.
