import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { onAuthStateChanged, signInAnonymously, signOut, User } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { UserProfile } from "../types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * L'élève n'a pas de mot de passe : il arrive depuis le tableau de bord
 * Corrige.moi avec son nom et son code d'accès en paramètres d'URL
 * (?nom=...&code=...), comme pour les autres matières. On établit alors
 * une session Firebase anonyme, propre à ce code, utilisée comme clé de
 * ses documents Firestore.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: () => void = () => {};

    async function bootstrap() {
      const params = new URLSearchParams(window.location.search);
      const nom = params.get("nom");
      const code = params.get("code");

      if (nom && code) {
        const current = auth.currentUser;
        let needsFreshSession = true;
        if (current) {
          const existing = await getDoc(doc(db, "users", current.uid));
          needsFreshSession = existing.data()?.accessCode !== code;
        }
        if (needsFreshSession) {
          // Sur un poste partagé, l'élève précédent ne doit jamais hériter
          // des documents du suivant : on repart toujours d'une identité
          // propre au nouveau code.
          if (current) await signOut(auth);
          const credential = await signInAnonymously(auth);
          await setDoc(doc(db, "users", credential.user.uid), {
            examState: "not_started",
            displayName: nom,
            accessCode: code,
          });
        }
        // Nettoie l'URL pour ne pas laisser le nom/code affichés indéfiniment.
        window.history.replaceState({}, "", window.location.pathname);
      }

      unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
    }

    bootstrap();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile((snap.data() as UserProfile) ?? { examState: "not_started" });
    });
    return unsubscribe;
  }, [user]);

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
