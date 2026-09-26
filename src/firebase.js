import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBOCxiUN7a43P5M35VoLIAmHwJYcZqI5T8",
  authDomain: "agrovet-fa09a.firebaseapp.com",
  projectId: "agrovet-fa09a",
  storageBucket: "agrovet-fa09a.firebasestorage.app",
  messagingSenderId: "26269223830",
  appId: "1:26269223830:web:30e8bf6656cb9b50d4ebb7",
  measurementId: "G-RT60ZKRQMS"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Analytics is optional; it may be unavailable in some browsers or local environments.
export const analyticsPromise = isSupported()
  .then((supported) => supported ? getAnalytics(app) : null)
  .catch(() => null);
