# ShambaVet deployment checklist

## Before Vercel
- [ ] Check out `feature/complete-agricultural-network` and review the pull request before merging.
- [ ] Deploy the additive Firestore rules from this branch to Firebase project `agrovet-fa09a` using `firebase use agrovet-fa09a` followed by `firebase deploy --only firestore:rules`.
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
- [ ] County weather loads and displays the Open-Meteo source and forecast timestamp.
- [ ] A farmer can submit a veterinary consultation request and see its pending/contacted status.
- [ ] A farmer can submit a community post; it remains private until an administrator publishes it.
- [ ] A farmer can submit an opportunity; it remains private until an administrator publishes it.
- [ ] A farmer can submit a market observation; it is labelled community-reported after publication.
- [ ] Administrator can moderate each new queue and only approved content becomes public.
- [ ] AI Crop Advisor returns a preliminary assessment, shares the AI usage allowance and saves private history.
- [ ] AI Vet, PayHero STK, callback verification and payment recovery still work after the AI usage is shared.

## Known boundaries in this release
- Organization applications are manually reviewed by the ShambaVet platform admin. No automated government registry verification is performed.
- Organization staff subaccounts, QR attendance check-in and county-specific delegated admin roles are not included yet.
- Training certificates are not included.
- AI requires a valid Gemini API key in Vercel; it is not required for the core Firebase modules.
- PayHero and payment verification must be tested with the merchant's actual PayHero configuration before accepting real payments.

## New agricultural network boundaries
- Veterinary requests are enquiries, not confirmed bookings. Staff must contact the farmer and confirm professional availability.
- Market prices are user-submitted observations, not official or guaranteed prices.
- Weather forecasts use a representative geocoded location in the selected county and are not farm-specific measurements.
- Community posts and opportunity listings require manual administrator moderation.
- AI Crop Advisor is preliminary decision support. It must not be used as a pesticide prescription or replacement for a qualified extension officer.
- Offline synchronization, SMS/WhatsApp delivery, multi-tenant county permissions and automated veterinary scheduling remain separate future integrations and are not claimed as implemented by this release.
