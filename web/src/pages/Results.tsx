import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { gradeLetter } from "../services/api";
import { GradingResult } from "../types";

function CriterionBar({
  label,
  points,
  maxPoints,
  penalized,
  feedback,
}: {
  label: string;
  points: number;
  maxPoints: number;
  penalized: boolean;
  feedback: string;
}) {
  const pct = maxPoints ? Math.round((points / maxPoints) * 100) : 0;
  return (
    <div className="py-3 border-b border-slate-100 last:border-b-0">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-sm text-slate-600">
          {points} / {maxPoints}
          {penalized && (
            <span className="ml-2 text-xs text-red-600">
              (pénalité — 35 erreurs ou plus)
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${penalized ? "bg-red-400" : "bg-slate-700"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{feedback}</p>
    </div>
  );
}

export default function Results() {
  const { user, profile } = useAuth();
  const [correction, setCorrection] = useState<GradingResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "corrections", user.uid), (snap) => {
      setCorrection((snap.data() as GradingResult) ?? null);
    });
  }, [user]);

  async function handleGrade() {
    setGrading(true);
    setError(null);
    try {
      const { correction: result } = await gradeLetter();
      setCorrection(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGrading(false);
    }
  }

  if (!correction) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-800">
          Correction de la lettre ouverte
        </h2>
        <p className="text-slate-500 text-sm">
          Votre lettre a été soumise. Lancez la correction automatisée selon
          la grille ministérielle à cinq critères.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={handleGrade}
          disabled={grading || profile?.examState !== "exam_submitted"}
          className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
        >
          {grading ? "Correction en cours…" : "Corriger ma lettre"}
        </button>
      </div>
    );
  }

  const c = correction.criteria;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Résultat</h2>
        <p className="text-3xl font-bold text-slate-800 mt-2">
          {correction.totalScore} <span className="text-lg font-normal text-slate-400">/ 100</span>
        </p>
        <p className="text-sm text-slate-500 mt-1">
          {correction.totalErrors} erreurs de langue relevées.
          {correction.penaltyApplied && (
            <span className="text-red-600">
              {" "}
              Seuil de 35 erreurs atteint : les critères vocabulaire, syntaxe/ponctuation
              et orthographe sont ramenés à 0, conformément à la grille
              ministérielle.
            </span>
          )}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <CriterionBar
          label="1. Adaptation à la situation de communication"
          points={c.adaptation.points}
          maxPoints={c.adaptation.maxPoints}
          penalized={c.adaptation.penalized}
          feedback={c.adaptation.feedback}
        />
        <CriterionBar
          label="2. Cohérence du texte"
          points={c.coherence.points}
          maxPoints={c.coherence.maxPoints}
          penalized={c.coherence.penalized}
          feedback={c.coherence.feedback}
        />
        <CriterionBar
          label="3. Vocabulaire"
          points={c.vocabulaire.points}
          maxPoints={c.vocabulaire.maxPoints}
          penalized={c.vocabulaire.penalized}
          feedback={c.vocabulaire.feedback}
        />
        <CriterionBar
          label="4. Construction des phrases et ponctuation"
          points={c.syntaxe.points}
          maxPoints={c.syntaxe.maxPoints}
          penalized={c.syntaxe.penalized}
          feedback={c.syntaxe.feedback}
        />
        <CriterionBar
          label="5. Orthographe"
          points={c.orthographe.points}
          maxPoints={c.orthographe.maxPoints}
          penalized={c.orthographe.penalized}
          feedback={c.orthographe.feedback}
        />
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h3 className="font-medium text-slate-800 mb-2">Commentaire général</h3>
        <p className="text-sm text-slate-600">{correction.synthese}</p>
      </div>
    </div>
  );
}
