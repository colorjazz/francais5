export type ExamState =
  | "not_started"
  | "corpus_ready"
  | "notes_in_progress"
  | "notes_validated"
  | "exam_in_progress"
  | "exam_submitted"
  | "graded";

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
}

export interface NotesValidation {
  conforme: boolean;
  score: number;
  problemes: string[];
  extraitsProblematiques: string[];
  feedback: string;
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
  maxScore: number;
  synthese: string;
}

export interface UserProfile {
  examState: ExamState;
  displayName?: string;
  examStartTime?: { seconds: number; nanoseconds: number };
  examDeadline?: { seconds: number; nanoseconds: number };
}
