export type ExamState =
  | "not_started"
  | "corpus_ready"
  | "notes_in_progress"
  | "notes_validated"
  | "exam_in_progress"
  | "exam_submitted"
  | "graded";

/**
 * "entrainement" : l'élève peut quitter la session d'écriture, ce qui met
 * le chronomètre en pause jusqu'à ce qu'il reprenne.
 * "simulation" : conditions réelles de l'épreuve — le chronomètre ne peut
 * jamais être mis en pause, quoi que fasse l'élève.
 */
export type ExamMode = "entrainement" | "simulation";

export type TextType = "courant" | "litteraire";

export interface CorpusText {
  id: string;
  title: string;
  author: string;
  type: TextType;
  genre: string;
  content: string;
  publication: string;
}

export interface Corpus {
  topic: string;
  question: string;
  texts: CorpusText[];
  generatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export interface NotesValidation {
  conforme: boolean;
  score: number;
  problemes: string[];
  extraitsProblematiques: string[];
  feedback: string;
  checkedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export interface LetterSubmission {
  letterText: string;
  wordCount: number;
  startedAt: FirebaseFirestore.Timestamp;
  submittedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  autoSubmitted: boolean;
}

export interface CriterionResult {
  label: string;
  maxPoints: number;
  points: number;
  penalized: boolean;
  feedback: string;
}

export interface GradingResult {
  criteria: {
    adaptation: CriterionResult;
    coherence: CriterionResult;
    vocabulaire: CriterionResult;
    syntaxe: CriterionResult;
    orthographe: CriterionResult;
  };
  totalErrors: number;
  penaltyApplied: boolean;
  totalScore: number;
  maxScore: 100;
  synthese: string;
  gradedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

/** Raw shape expected back from the grading model, before the penalty rule is applied. */
export interface RawGradingModelOutput {
  adaptation: { points: number; feedback: string };
  coherence: { points: number; feedback: string };
  vocabulaire: { points: number; feedback: string };
  syntaxe: { points: number; feedback: string };
  orthographe: { points: number; feedback: string };
  totalErrors: number;
  synthese: string;
}
