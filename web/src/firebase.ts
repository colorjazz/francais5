import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Config publique du projet Firebase partagé "histoire-nationale" (tableau
// de bord Corrige.moi). La clé d'API Firebase web n'est pas un secret — sa
// sécurité vient des règles Firestore, pas de sa confidentialité — donc on
// peut la garder en dur ici comme valeur par défaut, comme le fait déjà le
// reste du tableau de bord. Des variables VITE_FIREBASE_* (voir
// web/.env.example), si définies, la remplacent pour tester contre un autre
// projet sans toucher au code.
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyA8moMjFA7oBO5LRBNiPHBJmjilefVEg5o",
  authDomain: "histoire-nationale.firebaseapp.com",
  projectId: "histoire-nationale",
  storageBucket: "histoire-nationale.firebasestorage.app",
  messagingSenderId: "451701053568",
  appId: "1:451701053568:web:3b99396dd35079c59a6e65",
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(
  app,
  import.meta.env.VITE_FUNCTIONS_REGION || "northamerica-northeast1"
);
