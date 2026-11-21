# ShambaVet push and WhatsApp delivery setup

The notification centre supports in-app alerts, browser Web Push, and opt-in WhatsApp template broadcasts. Delivery is sent only for public announcements (audience: all); private/admin-only notices stay in-app.

## 1. Browser push setup

Generate a VAPID key pair from the repository root:

```bash
node scripts/generate-vapid-keys.mjs
```

In Vercel → Project → Settings → Environment Variables, set these for the environments you use:

- `VITE_WEB_PUSH_PUBLIC_KEY`: generated public key (available to the browser at build time).
- `WEB_PUSH_VAPID_PUBLIC_KEY`: same public key (server-side).
- `WEB_PUSH_VAPID_PRIVATE_KEY`: generated private key (server-side secret; never prefix with VITE_).
- `WEB_PUSH_SUBJECT`: a contact URI such as `mailto:support@shambavet.co.ke`.

Redeploy after adding or changing the `VITE_` variable. Farmers then open Notifications and choose **Enable alerts** on each device/browser. They must grant browser permission. Push works on HTTPS; browser/device support and power-saving settings affect delivery.

The API stores each browser endpoint against the signed-in Firebase UID. It requires the existing `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_WEB_API_KEY` Vercel variables. Expired push endpoints are deactivated when a push provider returns 404/410.

## 2. WhatsApp Business Platform setup

The community invitation link is not a broadcast API. Automatic broadcasts use Meta's official WhatsApp Cloud API. Complete Meta Business/WhatsApp onboarding and add these server-side Vercel variables:

- `WHATSAPP_ACCESS_TOKEN`: long-lived/system-user access token with WhatsApp messaging permission.
- `WHATSAPP_PHONE_NUMBER_ID`: the business phone-number ID from WhatsApp Manager.
- `WHATSAPP_TEMPLATE_NAME`: an approved message template name.
- `WHATSAPP_TEMPLATE_LANGUAGE`: exact approved template language code, e.g. `en`.
- `WHATSAPP_GRAPH_API_VERSION`: Graph API version, currently defaulted to `v27.0`.

Create and get approval for a template whose BODY contains exactly two text placeholders, for example:

```
{{1}}
{{2}}
```

The first parameter receives the announcement title; the second receives the announcement message. Select the correct Meta template category (typically MARKETING for general community announcements). The code sends template messages, not arbitrary unsolicited free-form text.

Farmers must enter their WhatsApp number in international format (for example `+2547XXXXXXXX`) and actively opt in from Notifications. They can opt out there at any time. Do not upload purchased or scraped contact lists.

## 3. How automatic delivery works

When a developer administrator publishes a public announcement, ShambaVet:

1. Saves the in-app announcement.
2. Attempts a browser push broadcast to active registered devices.
3. Attempts a WhatsApp template broadcast to active, consenting numbers.

A channel that is not configured reports a delivery warning in the Vercel function logs; it does not prevent the in-app announcement from being saved. Delivery counts are returned by the channel endpoints. Each Vercel invocation processes up to 200 opted-in devices/numbers in bounded batches; larger audiences report the remaining count as not processed. For a large-scale launch, move the send jobs to a durable queue so all recipients are processed with retries. Private/admin notifications are not broadcast.

## 4. Release checks

- Confirm the service worker is active on the production HTTPS domain.
- Subscribe one Android/Chrome device and one desktop browser.
- Send a test public announcement and verify notification click opens ShambaVet.
- Opt in a test WhatsApp number and verify it receives the approved template.
- Opt out and verify the number is excluded from the next broadcast.
- Keep VAPID private key and Meta access token only in Vercel server-side environment variables.