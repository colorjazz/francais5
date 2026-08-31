import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { submitReadingAnalysis } from "../services/api";
import {
  ArgumentBankEntry,
  ArgumentStance,
  ArgumentType,
  Corpus,
  PointDeVue,
  ReadingAnalyses,
} from "../types";

const ARG_TYPE_LABEL: Record<ArgumentType, string> = {
  fait: "Fait vérifiable",
  opinion: "Opinion",
  discours_rapporte: "Discours rapporté",
};

const POINT_DE_VUE_LABEL: Record<PointDeVue, string> = {
  favorable: "Favorable",
  defavorable: "Défavorable",
  nuance: "Nuancé",
};

interface TextAnswers {
  these: string;
  pointDeVue: PointDeVue | "";
  pointDeVueJustification: string;
  credibilite: string;
  args: Record<string, ArgumentType | "">;
}

function emptyAnswers(): TextAnswers {
  return { these: "", pointDeVue: "", pointDeVueJustification: "", credibilite: "", args: {} };
}

function bankKey() {
  return "entries";
}

export default function Lecture() {
  const { user } = useAuth();
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [analyses, setAnalyses] = useState<ReadingAnalyses>({});
  const [bank, setBank] = useState<ArgumentBankEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answersByText, setAnswersByText] = useState<Record<string, TextAnswers>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBank, setShowBank] = useState(false);
  const initialized = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const unsubCorpus = onSnapshot(doc(db, "corpora", user.uid), (snap) => {
      const data = snap.data() as Corpus | undefined;
      setCorpus(data ?? null);
      if (data?.texts?.length) setActiveId((id) => id ?? data.texts[0].id);
    });
    const unsubAnalyses = onSnapshot(doc(db, "readingAnalyses", user.uid), (snap) => {
      setAnalyses((snap.data() as ReadingAnalyses) ?? {});
    });
    const unsubBank = onSnapshot(doc(db, "argumentBank", user.uid), (snap) => {
      setBank((snap.data()?.[bankKey()] as ArgumentBankEntry[]) ?? []);
    });
    return () => {
      unsubCorpus();
      unsubAnalyses();
      unsubBank();
    };
  }, [user]);

  const activeText = corpus?.texts.find((t) => t.id === activeId) ?? corpus?.texts[0];

  // Pré-remplit le formulaire avec une analyse déjà soumise pour ce texte,
  // une seule fois (pour ne pas écraser ce que l'élève est en train de taper).
  useEffect(() => {
    if (!activeText || initialized.current.has(activeText.id)) return;
    initialized.current.add(activeText.id);
    const existing = analyses[activeText.id];
    setAnswersByText((prev) => ({
      ...prev,
      [activeText.id]: existing
        ? {
            these: existing.theseProposee,
            pointDeVue: existing.pointDeVueChoisi,
            pointDeVueJustification: "",
            credibilite: existing.credibiliteReponse,
            args: Object.fromEntries(
              existing.argumentResults.map((r) => [r.id, r.propose])
            ),
          }
        : emptyAnswers(),
    }));
  }, [activeText, analyses]);

  function updateAnswers(textId: string, patch: Partial<TextAnswers>) {
    setAnswersByText((prev) => ({
      ...prev,
      [textId]: { ...(prev[textId] ?? emptyAnswers()), ...patch },
    }));
  }

  function updateArgType(textId: string, argId: string, type: ArgumentType) {
    setAnswersByText((prev) => ({
      ...prev,
      [textId]: {
        ...(prev[textId] ?? emptyAnswers()),
        args: { ...(prev[textId]?.args ?? {}), [argId]: type },
      },
    }));
  }

  async function handleVerify() {
    if (!activeText) return;
    const a = answersByText[activeText.id] ?? emptyAnswers();
    if (!a.these.trim() || !a.pointDeVue) {
      setError("Réponds à la thèse et au point de vue avant de vérifier.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitReadingAnalysis({
        textId: activeText.id,
        theseProposee: a.these,
        pointDeVueChoisi: a.pointDeVue,
        pointDeVueJustification: a.pointDeVueJustification,
        credibiliteReponse: a.credibilite,
        argumentClassifications: activeText.arguments.map((arg) => ({
          id: arg.id,
          type: (a.args[arg.id] || "opinion") as ArgumentType,
        })),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleBank(argId: string, extrait: string, stance: ArgumentStance) {
    if (!user || !activeText) return;
    const existingIndex = bank.findIndex(
      (e) => e.textId === activeText.id && e.id === argId
    );
    let next: ArgumentBankEntry[];
    if (existingIndex >= 0 && bank[existingIndex].stance === stance) {
      next = bank.filter((_, i) => i !== existingIndex);
    } else if (existingIndex >= 0) {
      next = bank.map((e, i) => (i === existingIndex ? { ...e, stance } : e));
    } else {
      next = [
        ...bank,
        { id: argId, textId: activeText.id, textTitle: activeText.title, extrait, stance },
      ];
    }
    await setDoc(doc(db, "argumentBank", user.uid), { [bankKey()]: next }, { merge: true });
  }

  if (!corpus) {
    return (
      <p className="text-slate-500">
        Aucun dossier généré pour le moment. Retournez au tableau de bord
        pour recevoir votre dossier préparatoire.
      </p>
    );
  }

  const a = activeText ? answersByText[activeText.id] ?? emptyAnswers() : emptyAnswers();
  const existingAnalysis = activeText ? analyses[activeText.id] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">
            Section A — Lire et apprécier
          </p>
          <h2 className="text-xl font-semibold text-slate-800">
            Analyse critique du dossier
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Pour chaque texte : dégage la thèse, identifie le point de vue de
            l'énonciateur, classe les arguments et juge de la crédibilité de
            la source. Exercice formatif, non noté.
          </p>
        </div>
        <button
          onClick={() => setShowBank((v) => !v)}
          className="shrink-0 rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-100"
        >
          Ma banque d'arguments ({bank.length})
        </button>
      </div>

      {showBank && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {bank.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucun argument retenu pour l'instant. Depuis un texte, marque un
              extrait « pour », « contre » ou « à nuancer » pour l'ajouter ici.
            </p>
          ) : (
            <ul className="space-y-3">
              {bank.map((entry) => (
                <li key={`${entry.textId}-${entry.id}`} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <span
                      className={`inline-block text-xs rounded-full px-2 py-0.5 mr-2 ${
                        entry.stance === "pour"
                          ? "bg-emerald-100 text-emerald-700"
                          : entry.stance === "contre"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {entry.stance}
                    </span>
                    <span className="italic text-slate-700">« {entry.extrait} »</span>
                    <span className="block text-xs text-slate-400 mt-0.5">{entry.textTitle}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6">
        <nav className="space-y-1">
          {corpus.texts.map((text, i) => (
            <button
              key={text.id}
              onClick={() => setActiveId(text.id)}
              className={`w-full text-left rounded-md px-3 py-2 text-sm ${
                activeText?.id === text.id
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="block font-medium">
                Texte {i + 1} {analyses[text.id] && "✓"}
              </span>
              <span className="block text-xs opacity-80 truncate">{text.title}</span>
            </button>
          ))}
        </nav>

        {activeText && (
          <div className="space-y-5">
            <article className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-800">{activeText.title}</h3>
              <p className="text-sm text-slate-500 mb-3">
                {activeText.author} — {activeText.publication}
              </p>
              <div className="whitespace-pre-wrap text-slate-700 leading-relaxed text-sm max-h-64 overflow-y-auto">
                {activeText.content}
              </div>
            </article>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Quelle est la thèse (ou l'idée principale) de ce texte ?
                </label>
                <textarea
                  value={a.these}
                  onChange={(e) => updateAnswers(activeText.id, { these: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                {existingAnalysis && (
                  <p
                    className={`mt-2 text-sm ${
                      existingAnalysis.theseCorrecte ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {existingAnalysis.theseFeedback}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Quel est le point de vue de l'énonciateur ?
                </label>
                <div className="flex gap-2 mb-2">
                  {(Object.keys(POINT_DE_VUE_LABEL) as PointDeVue[]).map((pv) => (
                    <button
                      key={pv}
                      type="button"
                      onClick={() => updateAnswers(activeText.id, { pointDeVue: pv })}
                      className={`rounded-md px-3 py-1.5 text-sm border ${
                        a.pointDeVue === pv
                          ? "bg-slate-800 text-white border-slate-800"
                          : "border-slate-300 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {POINT_DE_VUE_LABEL[pv]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={a.pointDeVueJustification}
                  onChange={(e) =>
                    updateAnswers(activeText.id, { pointDeVueJustification: e.target.value })
                  }
                  rows={2}
                  placeholder="Justifie ton choix…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                {existingAnalysis && (
                  <p
                    className={`mt-2 text-sm ${
                      existingAnalysis.pointDeVueCorrect ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {existingAnalysis.pointDeVueFeedback}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Classe ces extraits et retiens ceux qui te seront utiles
                </label>
                <ul className="space-y-3">
                  {activeText.arguments.map((arg) => {
                    const result = existingAnalysis?.argumentResults.find((r) => r.id === arg.id);
                    const bankEntry = bank.find((e) => e.textId === activeText.id && e.id === arg.id);
                    return (
                      <li key={arg.id} className="rounded-md border border-slate-200 p-3">
                        <p className="text-sm italic text-slate-700 mb-2">« {arg.extrait} »</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={a.args[arg.id] ?? ""}
                            onChange={(e) =>
                              updateArgType(activeText.id, arg.id, e.target.value as ArgumentType)
                            }
                            className="rounded-md border border-slate-300 text-sm px-2 py-1"
                          >
                            <option value="" disabled>
                              Type d'argument…
                            </option>
                            {(Object.keys(ARG_TYPE_LABEL) as ArgumentType[]).map((t) => (
                              <option key={t} value={t}>
                                {ARG_TYPE_LABEL[t]}
                              </option>
                            ))}
                          </select>
                          {result && (
                            <span
                              className={`text-xs ${
                                result.estCorrect ? "text-emerald-700" : "text-amber-700"
                              }`}
                            >
                              {result.estCorrect
                                ? "✓ correct"
                                : `à revoir — c'est plutôt : ${ARG_TYPE_LABEL[result.correct]}`}
                            </span>
                          )}
                          <span className="ml-auto flex gap-1">
                            {(["pour", "contre", "nuance"] as ArgumentStance[]).map((stance) => (
                              <button
                                key={stance}
                                type="button"
                                onClick={() => toggleBank(arg.id, arg.extrait, stance)}
                                className={`text-xs rounded-full px-2 py-1 border ${
                                  bankEntry?.stance === stance
                                    ? "bg-slate-800 text-white border-slate-800"
                                    : "border-slate-300 text-slate-500 hover:bg-slate-100"
                                }`}
                              >
                                {stance}
                              </button>
                            ))}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cette source te semble-t-elle crédible ? Pourquoi ?
                </label>
                <textarea
                  value={a.credibilite}
                  onChange={(e) => updateAnswers(activeText.id, { credibilite: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                {existingAnalysis && (
                  <p className="mt-2 text-sm text-slate-600">{existingAnalysis.credibiliteFeedback}</p>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleVerify}
                  disabled={busy}
                  className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
                >
                  {busy ? "Analyse en cours…" : "Vérifier mon analyse"}
                </button>
                {existingAnalysis && (
                  <span className="text-sm text-slate-500">Score : {existingAnalysis.score} / 100</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
