import { FormEvent, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { discussionReply, endDiscussion, startDiscussion } from "../services/api";
import { Discussion as DiscussionType } from "../types";

const TOUR_MAX = 6;

/**
 * Le Web Speech API de reconnaissance vocale n'est pas standard (absent de
 * lib.dom.d.ts) : on ne type que ce dont ce composant se sert.
 */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "fr-CA";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export default function Discussion() {
  const { user } = useAuth();
  const [discussion, setDiscussion] = useState<DiscussionType | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [theseInput, setTheseInput] = useState("");
  const [message, setMessage] = useState("");
  const [tour, setTour] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const voiceSupported = typeof window !== "undefined" && !!getSpeechRecognitionCtor();
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "discussions", user.uid), (snap) => {
      setDiscussion((snap.data() as DiscussionType) ?? null);
      setLoaded(true);
    });
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [discussion?.messages.length]);

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    if (!theseInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await startDiscussion(theseInput.trim());
      setTour(1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    const text = message.trim();
    setMessage("");
    setBusy(true);
    setError(null);
    try {
      const res = await discussionReply(text);
      setTour(res.tour + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    setBusy(true);
    setError(null);
    try {
      await endDiscussion();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleListening() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "fr-CA";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setMessage((m) => (m ? m + " " + transcript : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!loaded) return null;

  if (!discussion) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-sm uppercase tracking-wide text-slate-400">
          Section B — Communiquer oralement
        </p>
        <h2 className="text-xl font-semibold text-slate-800">
          Discussion préparatoire avec un pair
        </h2>
        <p className="text-slate-500 text-sm">
          Avant de rédiger ta lettre ouverte, l'épreuve prévoit une
          discussion entre pairs pour approfondir ta réflexion. Énonce la
          thèse que tu défends pour l'instant : ton interlocuteur (l'IA) va
          te poser des objections pour t'entraîner à la justifier et à la
          nuancer.
        </p>
        <form onSubmit={handleStart} className="space-y-3">
          <textarea
            value={theseInput}
            onChange={(e) => setTheseInput(e.target.value)}
            rows={3}
            placeholder="Ex. : Je pense que le temps d'écran des adolescents devrait être encadré par la loi parce que…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !theseInput.trim()}
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Préparation…" : "Commencer la discussion"}
          </button>
        </form>
      </div>
    );
  }

  const ended = !!discussion.synthese;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">
            Section B — Communiquer oralement
          </p>
          <h2 className="text-xl font-semibold text-slate-800">Discussion préparatoire</h2>
          <p className="text-sm text-slate-500 mt-1">
            Ta thèse : <span className="italic">« {discussion.these} »</span>
          </p>
        </div>
        {!ended && (
          <span className="shrink-0 text-xs rounded-full bg-slate-100 px-3 py-1 text-slate-500">
            Tour {Math.min(tour, TOUR_MAX)} / {TOUR_MAX}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 max-h-[420px] overflow-y-auto"
      >
        {discussion.messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "eleve" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                m.role === "eleve"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <p>{m.texte}</p>
              {m.role === "ia" && speechSupported && (
                <button
                  onClick={() => speak(m.texte)}
                  className="mt-1 text-xs opacity-60 hover:opacity-100"
                  title="Écouter"
                >
                  🔊 écouter
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {ended ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-medium text-slate-800 mb-2">Synthèse</h3>
          <p className="text-sm text-slate-700">{discussion.synthese}</p>
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            disabled={busy || tour > TOUR_MAX}
            placeholder="Réponds à l'objection…"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleListening}
              className={`rounded-md px-3 py-2 text-sm border ${
                listening
                  ? "bg-red-600 text-white border-red-600"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
              title="Dicter ma réponse"
            >
              🎤
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !message.trim() || tour > TOUR_MAX}
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            Envoyer
          </button>
        </form>
      )}

      {!ended && (
        <div className="flex justify-end">
          <button
            onClick={handleEnd}
            disabled={busy || discussion.messages.length === 0}
            className="rounded-md border border-slate-300 text-slate-600 text-sm font-medium px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
          >
            Terminer la discussion et obtenir ma synthèse
          </button>
        </div>
      )}
    </div>
  );
}
