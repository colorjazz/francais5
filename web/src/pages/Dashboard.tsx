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
    label: "2. Préparation autonome",
    description:
      "À votre rythme, sur plusieurs jours si besoin : lisez et analysez le dossier (section A), confrontez vos idées en discussion avec l'IA (section B), puis consignez vos idées dans votre feuille de notes en style télégraphique.",
  },
  {
    state: "notes_validated",
    label: "3. Jour de l'évaluation (section C)",
    description:
      "Une fois votre feuille de notes validée, choisissez votre mode d'écriture — entraînement (pause possible) ou simulation d'examen (aucune sortie possible) — puis rédigez votre lettre ouverte en 3 h 15.",
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
        <div className="grid sm:grid-cols-2 gap-3">
          <Link
            to="/dossier"
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <span className="block text-sm font-medium text-slate-800">Dossier préparatoire</span>
            <span className="block text-xs text-slate-500 mt-1">Lire les textes du dossier.</span>
          </Link>
          <Link
            to="/lecture"
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <span className="block text-sm font-medium text-slate-800">Section A — Analyse critique</span>
            <span className="block text-xs text-slate-500 mt-1">
              Thèse, point de vue, arguments et crédibilité des sources.
            </span>
          </Link>
          <Link
            to="/discussion"
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <span className="block text-sm font-medium text-slate-800">Section B — Discussion préparatoire</span>
            <span className="block text-xs text-slate-500 mt-1">
              Défends ta thèse face aux objections d'un pair simulé par l'IA.
            </span>
          </Link>
          <Link
            to="/notes"
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <span className="block text-sm font-medium text-slate-800">Ma feuille de notes</span>
            <span className="block text-xs text-slate-500 mt-1">
              Consigne tes idées en style télégraphique pour le jour de l'épreuve.
            </span>
          </Link>
        </div>
      )}

      <div className="flex gap-3">
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
