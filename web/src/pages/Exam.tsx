import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { startExam, submitLetter } from "../services/api";
import Timer from "../components/Timer";

function draftKey(uid: string) {
  return `francais5-lettre-${uid}`;
}

export default function Exam() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  const [letter, setLetter] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(draftKey(user.uid));
    if (saved) setLetter(saved);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(draftKey(user.uid), letter);
  }, [letter, user]);

  useEffect(() => {
    async function init() {
      if (!profile || !user) return;
      if (profile.examState === "exam_in_progress" && profile.examDeadline) {
        setDeadlineMs(profile.examDeadline.seconds * 1000);
        return;
      }
      if (profile.examState === "notes_validated") {
        setStarting(true);
        try {
          const { examDeadline } = await startExam();
          setDeadlineMs(examDeadline.seconds * 1000);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setStarting(false);
        }
      }
    }
    init();
  }, [profile, user]);

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

  if (profile?.examState === "exam_submitted" || profile?.examState === "graded") {
    navigate("/resultats");
    return null;
  }

  if (starting || deadlineMs === null) {
    return (
      <p className="text-slate-500">Préparation de l'épreuve chronométrée…</p>
    );
  }

  const wordCount = letter.trim().length ? letter.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            Rédaction de la lettre ouverte
          </h2>
          <p className="text-sm text-slate-500">
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
        <button
          onClick={() => doSubmit(false)}
          disabled={submitting || letter.trim().length === 0}
          className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Envoi…" : "Remettre ma copie"}
        </button>
      </div>
    </div>
  );
}
