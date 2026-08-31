import { ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const STEP_LABELS: Record<string, string> = {
  not_started: "Non commencé",
  corpus_ready: "Dossier reçu",
  notes_in_progress: "Notes en cours",
  notes_validated: "Notes validées",
  exam_in_progress: "Rédaction en cours",
  exam_submitted: "Lettre soumise",
  graded: "Corrigé",
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, profile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Mode simulation d'examen en cours : la session est verrouillée sur la
  // page d'écriture, quelle que soit la route visée par l'élève.
  const locked =
    profile?.examState === "exam_in_progress" &&
    profile?.examMode === "simulation";

  useEffect(() => {
    if (locked && location.pathname !== "/examen") {
      navigate("/examen", { replace: true });
    }
  }, [locked, location.pathname, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">
            Simulation — Épreuve unique de français, 5<sup>e</sup> secondaire
          </h1>
          <p className="text-xs text-slate-500">Section C : dossier, notes et lettre ouverte</p>
        </div>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              {profile ? STEP_LABELS[profile.examState] : "…"}
            </span>
            <span className="text-slate-500">{user.email}</span>
            {locked ? (
              <span
                className="text-slate-300 cursor-not-allowed"
                title="Verrouillé pendant la simulation d'examen"
              >
                Se déconnecter
              </span>
            ) : (
              <button
                onClick={() => logout()}
                className="text-slate-500 underline hover:text-slate-800"
              >
                Se déconnecter
              </button>
            )}
          </div>
        )}
      </header>
      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
