import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import {
  ArgumentType,
  Corpus,
  ExamMode,
  GradingResult,
  NotesValidation,
  PointDeVue,
  ReadingAnalysisEntry,
} from "../types";

export async function generateCorpus(
  topic?: string
): Promise<{ corpus: Corpus; alreadyExisted: boolean }> {
  const call = httpsCallable(functions, "generateCorpus");
  const result = await call({ topic });
  return result.data as { corpus: Corpus; alreadyExisted: boolean };
}

export async function validateNotes(
  content: string
): Promise<NotesValidation> {
  const call = httpsCallable(functions, "validateNotes");
  const result = await call({ content });
  return result.data as NotesValidation;
}

export async function startExam(mode: ExamMode): Promise<{
  examStartTime: { seconds: number; nanoseconds: number };
  examDeadline: { seconds: number; nanoseconds: number };
  examMode: ExamMode;
  examRunning: boolean;
  examRemainingMs: number;
  alreadyStarted: boolean;
}> {
  const call = httpsCallable(functions, "startExam");
  const result = await call({ mode });
  return result.data as {
    examStartTime: { seconds: number; nanoseconds: number };
    examDeadline: { seconds: number; nanoseconds: number };
    examMode: ExamMode;
    examRunning: boolean;
    examRemainingMs: number;
    alreadyStarted: boolean;
  };
}

export async function pauseExam(): Promise<{
  examRemainingMs: number;
  alreadyPaused: boolean;
}> {
  const call = httpsCallable(functions, "pauseExam");
  const result = await call({});
  return result.data as { examRemainingMs: number; alreadyPaused: boolean };
}

export async function resumeExam(): Promise<{
  examDeadline: { seconds: number; nanoseconds: number };
  alreadyRunning: boolean;
}> {
  const call = httpsCallable(functions, "resumeExam");
  const result = await call({});
  return result.data as {
    examDeadline: { seconds: number; nanoseconds: number };
    alreadyRunning: boolean;
  };
}

export async function submitLetter(
  letterText: string,
  autoSubmitted = false
): Promise<{ received: boolean; wordCount: number }> {
  const call = httpsCallable(functions, "submitLetter");
  const result = await call({ letterText, autoSubmitted });
  return result.data as { received: boolean; wordCount: number };
}

export async function gradeLetter(): Promise<{
  correction: GradingResult;
  alreadyGraded: boolean;
}> {
  const call = httpsCallable(functions, "gradeLetter");
  const result = await call({});
  return result.data as { correction: GradingResult; alreadyGraded: boolean };
}

export async function getExamConfig(): Promise<{ examDurationMs: number }> {
  const call = httpsCallable(functions, "getExamConfig");
  const result = await call({});
  return result.data as { examDurationMs: number };
}

/* ---------------- Section A — lecture et analyse critique ---------------- */

export async function submitReadingAnalysis(params: {
  textId: string;
  theseProposee: string;
  pointDeVueChoisi: PointDeVue;
  pointDeVueJustification: string;
  credibiliteReponse: string;
  argumentClassifications: { id: string; type: ArgumentType }[];
}): Promise<{ entry: ReadingAnalysisEntry }> {
  const call = httpsCallable(functions, "submitReadingAnalysis");
  const result = await call(params);
  return result.data as { entry: ReadingAnalysisEntry };
}

/* ---------------- Section B — discussion préparatoire ---------------- */

export async function startDiscussion(
  these: string
): Promise<{ discussion: { these: string; messages: { role: string; texte: string }[] } }> {
  const call = httpsCallable(functions, "startDiscussion");
  const result = await call({ these });
  return result.data as {
    discussion: { these: string; messages: { role: string; texte: string }[] };
  };
}

export async function discussionReply(
  message: string
): Promise<{ reponse: string; tour: number; tourMax: number }> {
  const call = httpsCallable(functions, "discussionReply");
  const result = await call({ message });
  return result.data as { reponse: string; tour: number; tourMax: number };
}

export async function endDiscussion(): Promise<{
  synthese: string;
  alreadyEnded: boolean;
}> {
  const call = httpsCallable(functions, "endDiscussion");
  const result = await call({});
  return result.data as { synthese: string; alreadyEnded: boolean };
}
