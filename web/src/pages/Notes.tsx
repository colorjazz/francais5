import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { validateNotes } from "../services/api";
import { NotesValidation } from "../types";

const SAVE_DELAY_MS = 1500;

export default function Notes() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<NotesValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "notes", user.uid)).then((snap) => {
      setContent((snap.data()?.content as string) ?? "");
      setLoaded(true);
    });
  }, [user]);

  const persist = useCallback(
    (value: string) => {
      if (!user) return;
      setSaveState("saving");
      setDoc(
        doc(db, "notes", user.uid),
        { content: value, updatedAt: serverTimestamp() },
        { merge: true }
      ).then(() => setSaveState("saved"));
    },
    [user]
  );

  function handleChange(value: string) {
    setContent(value);
    setSaveState("idle");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => persist(value), SAVE_DELAY_MS);
  }

  async function handleValidate() {
    setValidating(true);
    setError(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    persist(content);
    try {
      const result = await validateNotes(content);
      setValidation(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setValidating(false);
    }
  }

  const wordCount = content.trim().length ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">
          Ma feuille de notes
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Rédigez en <strong>style télégraphique</strong> : mots-clés,
          abréviations, tirets, schémas. Aucun texte suivi (introduction,
          paragraphe rédigé, conclusion) n'est permis — l'évaluateur
          vérifiera la conformité avant l'épreuve.
        </p>
      </div>

      <textarea
        value={loaded ? content : ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={!loaded}
        rows={18}
        placeholder={
          "Ex.\nthèse : pour l'encadrement du temps d'écran\n- arg1 : sommeil ado (texte 3, stat 62%)\n- arg2 : concentration scolaire (texte 1)\nvocab : « nuire à », « à cet égard », « force est de constater »"
        }
        className="w-full rounded-xl border border-slate-300 p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{wordCount} mots</span>
        <span>
          {saveState === "saving" && "Sauvegarde…"}
          {saveState === "saved" && "Sauvegardé ✓"}
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleValidate}
        disabled={validating || content.trim().length === 0}
        className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
      >
        {validating ? "Analyse en cours…" : "Valider ma feuille de notes"}
      </button>

      {validation && (
        <div
          className={`rounded-xl border p-5 ${
            validation.conforme
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <h3 className="font-medium text-slate-800">
            {validation.conforme
              ? "Conforme — vous pouvez démarrer l'épreuve"
              : "Non conforme — des passages ressemblent à du texte déjà rédigé"}
          </h3>
          <p className="text-sm text-slate-600 mt-2">{validation.feedback}</p>
          {validation.extraitsProblematiques.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-600 list-disc list-inside">
              {validation.extraitsProblematiques.map((extract, i) => (
                <li key={i} className="italic">
                  « {extract} »
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
