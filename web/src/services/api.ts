import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { Corpus, GradingResult, NotesValidation } from "../types";

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

export async function startExam(): Promise<{
  examStartTime: { seconds: number; nanoseconds: number };
  examDeadline: { seconds: number; nanoseconds: number };
  alreadyStarted: boolean;
}> {
  const call = httpsCallable(functions, "startExam");
  const result = await call({});
  return result.data as {
    examStartTime: { seconds: number; nanoseconds: number };
    examDeadline: { seconds: number; nanoseconds: number };
    alreadyStarted: boolean;
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
