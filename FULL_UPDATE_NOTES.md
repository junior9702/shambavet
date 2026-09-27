# ShambaVet Full Update — Google Search + Marketplace

## Google Search Console
1. Deploy this project to the Vercel project serving `https://shambavet.vercel.app/`.
2. Confirm this exact file opens:
   `https://shambavet.vercel.app/google6bbca57e6e1f41c0.html`
3. It must display:
   `google-site-verification: google6bbca57e6e1f41c0.html`
4. In Google Search Console, use the HTML file verification method and click Verify.
5. Submit `sitemap.xml`.
6. Request indexing for the homepage.

If Google Search Console has generated a different verification filename/token for your current property, use the exact newly downloaded file from Google instead of the included file.

## Marketplace
The marketplace is now functional and stored in Firestore:
`marketplaceProducts`

Admin:
- Sign in through Admin Dashboard.
- Open Marketplace.
- Add products/listings.
- Edit, feature, hide/show, or remove listings.

Farmer/public:
- Search products.
- Filter categories.
- See price, unit, stock, seller and location.
- Contact seller by WhatsApp or phone.

## Firebase
Deploy the included `firestore.rules` so:
- marketplace products are public-read;
- only an enabled admin can create, edit or delete marketplace products.

## Build
This is a Vite project for Vercel. Run:
`npm install`
`npm run build`
