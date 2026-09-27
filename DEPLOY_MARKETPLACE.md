# ShambaVet Marketplace setup

## 1. Firebase admin document

In Firebase Console → Firestore Database → Data, create:

- Collection: `admins`
- Document ID: the exact Firebase Authentication UID of the administrator
- Field: `enabled` → Boolean → `true`

The app now checks this document before enabling Add/Update Product.

## 2. Deploy Firestore rules

This project includes `firebase.json` and `.firebaserc` configured for project `agrovet-fa09a`.

From the project root, with Firebase CLI logged into the correct Google account:

```bash
firebase login
firebase deploy --only firestore:rules
```

## 3. Marketplace sync

Products are stored in `marketplaceProducts` and both the Admin Marketplace list and public Marketplace listen to the same Firestore collection in real time.

After a successful save, the product should appear automatically in:

- Admin → Marketplace products
- Main navigation → Marketplace

Only products with `available: true` are shown publicly.

## 4. If you still see permission-denied

Check that the signed-in admin UID exactly matches the document ID under `admins`, that `enabled` is the Boolean `true`, and that the current `firestore.rules` have been deployed to Firebase.
