import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { generateCorpus } from "../services/api";

const STEPS: { state: string; label: string; description: string }[] = [
  {
    state: "not_started",
    label: "1. Réception du dossier préparatoire",
    description:
      "Générez votre dossier de lecture (5 à 8 textes) sur une question à controverse. Il ne sera généré qu'une seule fois : vous retrouverez exactement les mêmes textes à chaque connexion.",
  },
  {
    state: "corpus_ready",
    label: "2. Lecture et feuille de notes",
    description:
      "Lisez le dossier à votre rythme, sur plusieurs jours si besoin, et consignez vos idées, citations et vocabulaire dans votre feuille de notes en style télégraphique.",
  },
  {
    state: "notes_validated",
    label: "3. Jour de l'évaluation",
    description:
      "Une fois votre feuille de notes validée par l'évaluateur, vous pourrez démarrer la rédaction chronométrée de votre lettre ouverte (3 h 15).",
  },
  {
    state: "exam_submitted",
    label: "4. Correction",
    description:
      "Votre lettre est soumise. Lancez la correction automatisée selon la grille ministérielle à cinq critères.",
  },
];

const ORDER = [
  "not_started",
  "corpus_ready",
  "notes_in_progress",
  "notes_validated",
  "exam_in_progress",
  "exam_submitted",
  "graded",
];

export default function Dashboard() {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = profile?.examState ?? "not_started";
  const rank = ORDER.indexOf(state);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      await generateCorpus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">
          Bienvenue{profile?.displayName ? `, ${profile.displayName}` : ""}
        </h2>
        <p className="text-slate-500 mt-1">
          Ce parcours reproduit les conditions réelles de l'épreuve unique
          d'écriture : réception du dossier préparatoire, phase autonome
          de lecture et de prise de notes, puis rédaction chronométrée
          suivie d'une correction selon la grille ministérielle.
        </p>
      </div>

      <ol className="space-y-4">
        {STEPS.map((step, i) => {
          const stepRank = ORDER.indexOf(step.state);
          const done = rank > stepRank || (state === "graded" && i === 3);
          const active =
            state === step.state ||
            (step.state === "corpus_ready" &&
              (state === "corpus_ready" || state === "notes_in_progress"));
          return (
            <li
              key={step.state}
              className={`rounded-xl border p-5 ${
                active
                  ? "border-slate-800 bg-white shadow-sm"
                  : done
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white opacity-60"
              }`}
            >
              <h3 className="font-medium text-slate-800">{step.label}</h3>
              <p className="text-sm text-slate-500 mt-1">{step.description}</p>
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        {state === "not_started" && (
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Génération du dossier…" : "Recevoir mon dossier préparatoire"}
          </button>
        )}
        {(state === "corpus_ready" || state === "notes_in_progress") && (
          <>
            <Link
              to="/dossier"
              className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700"
            >
              Lire le dossier
            </Link>
            <Link
              to="/notes"
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
            >
              Ma feuille de notes
            </Link>
          </>
        )}
        {state === "notes_validated" && (
          <Link
            to="/examen"
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700"
          >
            Démarrer l'épreuve chronométrée (3 h 15)
          </Link>
        )}
        {state === "exam_in_progress" && (
          <Link
            to="/examen"
            className="rounded-md bg-red-600 text-white text-sm font-medium px-4 py-2 hover:bg-red-700"
          >
            Reprendre la rédaction en cours
          </Link>
        )}
        {(state === "exam_submitted" || state === "graded") && (
          <Link
            to="/resultats"
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700"
          >
            {state === "graded" ? "Voir ma correction" : "Faire corriger ma lettre"}
          </Link>
        )}
      </div>
    </div>
  );
}
