# ShambaVet competitive product roadmap

## Product direction

ShambaVet is a Kenya-focused agricultural service hub. The product strategy is to connect farmer records, veterinary support, agricultural learning, extension activity and market access rather than present these as disconnected tools.

## Existing application capabilities observed in the main branch

The existing React/Vite application already contains:
- Firebase Authentication, including anonymous farmer sessions and account linking.
- Farmer portal with livestock, crop production, farm profile and farm business records.
- Animal health history and treatment/follow-up fields.
- AI Veterinary Assistant with usage limits and PayHero credit purchases.
- Veterinarian directory and application workflow.
- Agricultural marketplace and Agrovet portal.
- E-Learning Academy, course progress and certificate payments.
- Field Days and Live Training.
- Farm visit and extension report submission with image upload.
- Organisation and institution administration.
- Location directory and installable PWA foundations.

These are code-level observations, not a guarantee that every production integration is configured or every workflow has passed a live end-to-end test.

## Improvements in the competitor-ready release branch

1. Farmer-to-veterinarian consultation requests:
   - A farmer can select a listed veterinarian and submit a preferred date, time, contact phone, service type and case description.
   - Requests are stored under a dedicated `vetAppointments` collection.
   - Farmers can read only their own requests.
   - Only an enabled developer administrator can review and change request status.
   - The interface explicitly distinguishes a request from a confirmed appointment and directs emergencies to direct professional contact.
2. AI-to-veterinarian handoff:
   - The AI case can be carried into the veterinarian directory so the farmer does not need to retype the animal and symptom summary.
3. Animal care reminders:
   - Follow-up dates already recorded in animal health history are surfaced as scheduled or overdue reminders.
   - Reminders are informational and do not generate or alter veterinary treatment instructions.

## Remaining roadmap

### Farmer and livestock management
- Expand individual animal profiles with identification, ownership, production and movement history.
- Add configurable vaccination and husbandry schedules reviewed by local veterinary professionals.
- Add farmer-controlled export of animal and farm records.
- Keep all farmer records scoped to the authenticated account.

### Veterinary network
- Verify professional identity and registration before displaying a profile as verified.
- Add provider availability, acceptance/decline workflow and appointment confirmation.
- Add secure case notes and consent-based sharing.
- Do not represent a submitted request as a confirmed booking.

### Extension and institutional services
- Add organisation-scoped officer assignments and supervisor approvals.
- Add programme-level farmer registries, surveys and exportable monitoring reports.
- Restrict organisation and county dashboards to explicitly authorised datasets.
- Avoid exposing private farmer locations or health records by default.

### Learning and training
- Preserve current course, progress and certificate payment logic.
- Add trainer and institution roles only after permissions and payout handling are designed.
- Add QR certificate verification and offline course materials after storage and access rules are reviewed.

### Marketplace and commerce
- Improve supplier verification, listing moderation and order enquiries.
- Introduce payment collection, refunds, delivery tracking or escrow only after legal, financial and dispute processes are agreed.
- Clearly label sponsored placements.

### Data and integrations
- Add weather and market-price feeds only from providers with documented terms, update cadence and geographic coverage.
- Show source and last-updated time for all external data.
- Add Kiswahili and low-bandwidth optimisation.
- Add offline field forms with conflict-safe synchronisation and clear upload status.

## External prerequisites before public launch of advanced features

- Confirm production API credentials, quotas and terms for weather, market and messaging providers.
- Complete professional verification processes and confirm who is authorised to approve credentials.
- Define organisation contracts, data-controller responsibilities and access agreements.
- Review Kenya Data Protection Act obligations, privacy notices, consent, retention and data-subject request handling.
- Complete payment, refund, support and dispute workflows before introducing new paid services.
- Run end-to-end tests with real farmer, veterinarian, trainer and administrator accounts.

## Release safety checklist

- Do not replace the existing Firestore rules wholesale; merge collection rules and test them against actual client queries.
- Do not put Firebase service-account credentials, PayHero secrets or AI provider keys in browser code.
- Verify every payment server-side before granting credits or certificates.
- Use idempotent payment finalisation and prevent duplicate charges.
- Test account linking so anonymous-session farm data is not lost.
- Test uploads, mobile layouts, permissions and failed-network recovery.
- Keep changes on a feature branch until preview build and functional checks pass.
