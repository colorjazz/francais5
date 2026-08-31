import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { Corpus, ExamMode, GradingResult, NotesValidation } from "../types";

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
