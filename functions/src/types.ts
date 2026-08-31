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

/** Extrait d'argument public (sans son type) proposé à l'élève pour l'exercice de classification. */
export interface PublicArgument {
  id: string;
  extrait: string;
}

export interface CorpusText {
  id: string;
  title: string;
  author: string;
  type: TextType;
  genre: string;
  content: string;
  publication: string;
  arguments: PublicArgument[];
}

export interface Corpus {
  topic: string;
  question: string;
  texts: CorpusText[];
  generatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export type ArgumentType = "fait" | "opinion" | "discours_rapporte";
export type PointDeVue = "favorable" | "defavorable" | "nuance";

/**
 * Clé de correction cachée d'un texte du dossier : jamais exposée au
 * client (collection `corpusKeys`, refusée en lecture par les règles),
 * utilisée uniquement côté serveur pour évaluer les réponses de l'élève
 * dans les exercices de la section « Lire et apprécier ».
 */
export interface CorpusTextKey {
  textId: string;
  these: string;
  pointDeVue: PointDeVue;
  pointDeVueJustification: string;
  argumentTypes: { id: string; type: ArgumentType }[];
  credibiliteNotes: string;
}

export interface CorpusKey {
  texts: CorpusTextKey[];
}

/** Raw shapes expected back from the corpus-generation model, before the
 * response is split into the public Corpus (client-readable) and the
 * hidden CorpusKey (server-only). */
export interface RawCorpusArgument extends PublicArgument {
  type: ArgumentType;
}

export interface RawCorpusText extends Omit<CorpusText, "arguments"> {
  these: string;
  pointDeVue: PointDeVue;
  pointDeVueJustification: string;
  credibiliteNotes: string;
  arguments: RawCorpusArgument[];
}

export interface RawCorpusResponse {
  topic: string;
  question: string;
  texts: RawCorpusText[];
}

/** Rétroaction formative pour un texte, générée par submitReadingAnalysis. */
export interface ReadingAnalysisEntry {
  theseProposee: string;
  theseFeedback: string;
  theseCorrecte: boolean;
  pointDeVueChoisi: PointDeVue;
  pointDeVueFeedback: string;
  pointDeVueCorrect: boolean;
  argumentResults: { id: string; propose: ArgumentType; correct: ArgumentType; estCorrect: boolean }[];
  argumentScore: number;
  credibiliteReponse: string;
  credibiliteFeedback: string;
  score: number;
  submittedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

/** Raw shape expected back from the reading-analysis feedback model. */
export interface RawReadingFeedback {
  theseCorrecte: boolean;
  theseFeedback: string;
  pointDeVueCorrect: boolean;
  pointDeVueFeedback: string;
  credibiliteFeedback: string;
}

export type ArgumentStance = "pour" | "contre" | "nuance";

/** Une entrée de la banque d'arguments personnelle de l'élève. */
export interface ArgumentBankEntry {
  id: string;
  textId: string;
  textTitle: string;
  extrait: string;
  stance: ArgumentStance;
  note?: string;
  addedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export type DiscussionRole = "eleve" | "ia";

export interface DiscussionMessage {
  role: DiscussionRole;
  texte: string;
  at: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export interface Discussion {
  these: string;
  messages: DiscussionMessage[];
  synthese?: string;
  startedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
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
