import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { Corpus as CorpusType } from "../types";

export default function Corpus() {
  const { user } = useAuth();
  const [corpus, setCorpus] = useState<CorpusType | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "corpora", user.uid), (snap) => {
      const data = snap.data() as CorpusType | undefined;
      setCorpus(data ?? null);
      if (data?.texts?.length) setActiveId((id) => id ?? data.texts[0].id);
    });
    return unsubscribe;
  }, [user]);

  if (!corpus) {
    return (
      <p className="text-slate-500">
        Aucun dossier généré pour le moment. Retournez au tableau de bord
        pour recevoir votre dossier préparatoire.
      </p>
    );
  }

  const activeText = corpus.texts.find((t) => t.id === activeId) ?? corpus.texts[0];

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm uppercase tracking-wide text-slate-400">
          Dossier préparatoire
        </p>
        <h2 className="text-xl font-semibold text-slate-800">{corpus.question}</h2>
        <p className="text-slate-500 text-sm mt-1">{corpus.topic}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
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
              <span className="block font-medium">Texte {i + 1}</span>
              <span className="block text-xs opacity-80 truncate">
                {text.title}
              </span>
            </button>
          ))}
        </nav>

        {activeText && (
          <article className="bg-white border border-slate-200 rounded-xl p-6">
            <span className="inline-block text-xs uppercase tracking-wide rounded-full px-2 py-0.5 bg-slate-100 text-slate-500 mb-2">
              {activeText.type === "litteraire" ? "Texte littéraire" : "Texte courant"}
              {" · "}
              {activeText.genre}
            </span>
            <h3 className="text-lg font-semibold text-slate-800">
              {activeText.title}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {activeText.author} — {activeText.publication}
            </p>
            <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
              {activeText.content}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
