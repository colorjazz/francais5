import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// initializeApp()/getAuth() plantent au chargement du module (avant même
// que React ne monte quoi que ce soit) si la config est vide — ce qui, sans
// ce garde-fou, produit un écran blanc silencieux plutôt qu'un message
// exploitable. On vérifie donc explicitement et on écrit un message clair
// directement dans le DOM avant de relancer l'erreur.
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="max-width:560px;margin:80px auto;padding:24px;font-family:system-ui,sans-serif;color:#1a2233;line-height:1.5;">
        <h1 style="font-size:1.15rem;">Configuration Firebase manquante</h1>
        <p>Variable(s) d'environnement absente(s)&nbsp;: <strong>${missingKeys.join(", ")}</strong>.</p>
        <p>Ajoutez-les (préfixées <code>VITE_</code>, voir <code>web/.env.example</code>) dans les
        paramètres de votre hébergeur, puis redéployez.</p>
      </div>`;
  }
  throw new Error(
    `Configuration Firebase incomplète : variable(s) manquante(s) — ${missingKeys.join(", ")}`
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(
  app,
  import.meta.env.VITE_FUNCTIONS_REGION || "northamerica-northeast1"
);
