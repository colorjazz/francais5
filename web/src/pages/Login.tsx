import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white shadow-sm border border-slate-200 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">
          Épreuve de français — 5<sup>e</sup> secondaire
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Connectez-vous pour retrouver votre dossier préparatoire, votre
          feuille de notes et votre progression.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Nom complet
              </label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Courriel
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-800 text-white text-sm font-medium py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            {mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 text-sm text-slate-500 underline"
        >
          {mode === "login"
            ? "Pas encore de compte ? Inscrivez-vous"
            : "Déjà un compte ? Connectez-vous"}
        </button>
      </div>
    </div>
  );
}
