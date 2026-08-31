import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { pauseExam, resumeExam, startExam, submitLetter } from "../services/api";
import Timer from "../components/Timer";
import { ExamMode } from "../types";

function draftKey(uid: string) {
  return `francais5-lettre-${uid}`;
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function ModeChooser({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (mode: ExamMode) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-800">
        Choisis ton mode d'écriture
      </h2>
      <p className="text-sm text-slate-500">
        Le chronomètre officiel est de 3 h 15 dans les deux cas. Le mode
        change seulement ce qui se passe si tu quittes la session.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-medium text-slate-800">Entraînement</h3>
          <p className="text-sm text-slate-500 mt-2">
            Tu peux sortir de l'application à tout moment : le chronomètre
            se met en pause et reprend exactement là où tu l'as laissé.
          </p>
          <button
            onClick={() => onChoose("entrainement")}
            disabled={busy}
            className="mt-4 w-full rounded-md border border-slate-300 text-slate-700 text-sm font-medium py-2 hover:bg-slate-100 disabled:opacity-50"
          >
            Démarrer en entraînement
          </button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-white p-5">
          <h3 className="font-medium text-slate-800">Simulation d'examen</h3>
          <p className="text-sm text-slate-500 mt-2">
            Conditions réelles : impossible de sortir de l'épreuve ou de
            mettre le chronomètre en pause, quoi que tu fasses.
          </p>
          <button
            onClick={() => onChoose("simulation")}
            disabled={busy}
            className="mt-4 w-full rounded-md bg-slate-800 text-white text-sm font-medium py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            Démarrer en simulation
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Exam() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [letter, setLetter] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const pausingRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(draftKey(user.uid));
    if (saved) setLetter(saved);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(draftKey(user.uid), letter);
  }, [letter, user]);

  const mode = profile?.examMode;
  const running = profile?.examRunning !== false;
  const inProgress = profile?.examState === "exam_in_progress";

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setError(null);
      try {
        await submitLetter(letter, auto);
        if (user) localStorage.removeItem(draftKey(user.uid));
        navigate("/resultats");
      } catch (err) {
        submittedRef.current = false;
        setError((err as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [letter, navigate, user]
  );

  const doPause = useCallback(async () => {
    if (pausingRef.current) return;
    pausingRef.current = true;
    try {
      await pauseExam();
    } catch {
      // best effort — la reconnexion réessaiera via la prochaine action
    } finally {
      pausingRef.current = false;
    }
  }, []);

  // Mode entraînement : si l'élève quitte l'onglet ou l'application, le
  // chronomètre se met automatiquement en pause côté serveur.
  useEffect(() => {
    if (!inProgress || mode !== "entrainement" || !running) return;
    function handleVisibility() {
      if (document.hidden) doPause();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [inProgress, mode, running, doPause]);

  // Mode simulation : impossible de mettre le chronomètre en pause, on
  // avertit seulement l'élève avant une fermeture accidentelle de l'onglet.
  useEffect(() => {
    if (!inProgress || mode !== "simulation" || submittedRef.current) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [inProgress, mode]);

  async function handleChooseMode(chosen: ExamMode) {
    setBusy(true);
    setError(null);
    try {
      await startExam(chosen);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleQuit() {
    setBusy(true);
    setError(null);
    try {
      await doPause();
      navigate("/");
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    setError(null);
    try {
      await resumeExam();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (profile?.examState === "exam_submitted" || profile?.examState === "graded") {
    navigate("/resultats");
    return null;
  }

  if (profile?.examState === "notes_validated") {
    return <ModeChooser busy={busy} onChoose={handleChooseMode} />;
  }

  if (!inProgress || !profile?.examDeadline) {
    return (
      <p className="text-slate-500">Préparation de l'épreuve chronométrée…</p>
    );
  }

  const wordCount = letter.trim().length ? letter.trim().split(/\s+/).length : 0;

  if (mode === "entrainement" && !running) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-800">
          Session en pause
        </h2>
        <p className="text-sm text-slate-500">
          Ton chronomètre est arrêté. Il reprendra exactement à{" "}
          <span className="font-mono">
            {formatMs(profile.examRemainingMs ?? 0)}
          </span>{" "}
          restantes dès que tu reviendras à ta rédaction.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleResume}
            disabled={busy}
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Reprise…" : "Reprendre l'écriture"}
          </button>
          <button
            onClick={() => navigate("/")}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            Tableau de bord
          </button>
        </div>
      </div>
    );
  }

  const deadlineMs = profile.examDeadline.seconds * 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-800">
              Rédaction de la lettre ouverte
            </h2>
            <span
              className={`text-xs rounded-full px-2 py-0.5 ${
                mode === "simulation"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {mode === "simulation" ? "Simulation d'examen" : "Entraînement"}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Environ 500 mots. Défendez une thèse claire en réponse à la
            question de relance du dossier, à l'aide de votre feuille de
            notes.
          </p>
        </div>
        <Timer deadlineMs={deadlineMs} onExpire={() => doSubmit(true)} />
      </div>

      <textarea
        value={letter}
        onChange={(e) => setLetter(e.target.value)}
        disabled={submitting}
        rows={22}
        className="w-full rounded-xl border border-slate-300 p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-400"
        placeholder="Madame, Monsieur,"
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{wordCount} mots</span>
        {error && <span className="text-sm text-red-600">{error}</span>}
        <div className="flex gap-3">
          {mode === "entrainement" && (
            <button
              onClick={handleQuit}
              disabled={submitting || busy}
              className="rounded-md border border-slate-300 text-slate-600 text-sm font-medium px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
            >
              Quitter (le chronomètre s'arrête)
            </button>
          )}
          <button
            onClick={() => doSubmit(false)}
            disabled={submitting || letter.trim().length === 0}
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Envoi…" : "Remettre ma copie"}
          </button>
        </div>
      </div>
    </div>
  );
}
