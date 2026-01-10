
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

/**
 * PRODUCTION CONFIGURATION
 * Replace these placeholders with your actual Firebase project credentials
 * from the Firebase Console (Project Settings > General > Your Apps).
 */
const firebaseConfig = {
  apiKey: "AIzaSyAs-placeholder",
  authDomain: "unsere-liebe.firebaseapp.com",
  projectId: "unsere-liebe",
  storageBucket: "unsere-liebe.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Initialize anonymous session
export const loginAnonymously = () => signInAnonymously(auth);
