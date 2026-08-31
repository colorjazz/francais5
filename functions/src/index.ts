import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { askClaudeForJSON, anthropicApiKey } from "./claude";
import {
  buildCorpusUserPrompt,
  buildGradingUserPrompt,
  buildNotesValidationUserPrompt,
  CORPUS_SYSTEM_PROMPT,
  GRADING_SYSTEM_PROMPT,
  NOTES_VALIDATION_SYSTEM_PROMPT,
} from "./prompts";
import { applyGradingRules } from "./grading";
import {
  Corpus,
  ExamState,
  NotesValidation,
  RawGradingModelOutput,
} from "./types";

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "northamerica-northeast1", maxInstances: 10 });

/** Durée officielle de l'épreuve d'écriture : 3 heures 15 minutes. */
const EXAM_DURATION_MS = (3 * 60 + 15) * 60 * 1000;

function requireAuth(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Connexion requise.");
  }
  return uid;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

async function getExamState(uid: string): Promise<ExamState> {
  const snap = await db.collection("users").doc(uid).get();
  return (snap.data()?.examState as ExamState) ?? "not_started";
}

/**
 * Jour 1 : génère le dossier préparatoire (corpus) une seule fois par
 * élève, puis le fige en base. Les appels suivants renvoient le même
 * corpus déjà stocké, ce qui garantit que l'élève retrouve exactement les
 * mêmes textes en se reconnectant les jours suivants.
 */
export const generateCorpus = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const existing = await db.collection("corpora").doc(uid).get();
    if (existing.exists) {
      return { corpus: existing.data(), alreadyExisted: true };
    }

    const topic: string | undefined = request.data?.topic;
    const raw = await askClaudeForJSON<Omit<Corpus, "generatedAt">>({
      system: CORPUS_SYSTEM_PROMPT,
      user: buildCorpusUserPrompt(topic),
      maxTokens: 8000,
    });

    if (!Array.isArray(raw.texts) || raw.texts.length < 5) {
      throw new HttpsError(
        "internal",
        "Le dossier généré ne comporte pas assez de textes. Réessaie."
      );
    }

    const corpus: Corpus = {
      topic: raw.topic,
      question: raw.question,
      texts: raw.texts,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
      tx.set(db.collection("corpora").doc(uid), corpus);
      tx.set(
        userRef,
        { examState: "corpus_ready" satisfies ExamState },
        { merge: true }
      );
    });

    return { corpus, alreadyExisted: false };
  }
);

/**
 * Jour de l'évaluation : l'élève soumet sa feuille de notes à l'évaluateur
 * IA pour en vérifier la conformité (style télégraphique, aucun texte
 * suivi déjà rédigé) avant de pouvoir commencer la rédaction chronométrée.
 */
export const validateNotes = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const notesContent: string = (request.data?.content ?? "").toString();

    if (notesContent.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "La feuille de notes est vide."
      );
    }

    const corpusSnap = await db.collection("corpora").doc(uid).get();
    const corpus = corpusSnap.data() as Corpus | undefined;
    if (!corpus) {
      throw new HttpsError(
        "failed-precondition",
        "Le dossier préparatoire n'a pas encore été généré."
      );
    }

    const rawResult = await askClaudeForJSON<
      Omit<NotesValidation, "checkedAt">
    >({
      system: NOTES_VALIDATION_SYSTEM_PROMPT,
      user: buildNotesValidationUserPrompt(notesContent, corpus.question),
      maxTokens: 2000,
    });

    const validation: NotesValidation = {
      ...rawResult,
      checkedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
      tx.set(db.collection("validations").doc(uid), validation);
      if (validation.conforme) {
        tx.set(
          userRef,
          { examState: "notes_validated" satisfies ExamState },
          { merge: true }
        );
      }
    });

    return validation;
  }
);

/**
 * Démarre officiellement l'épreuve chronométrée (3h15). L'heure de départ
 * et l'échéance sont fixées côté serveur pour empêcher toute manipulation
 * du chronomètre par le client.
 */
export const startExam = onCall({}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const state = await getExamState(uid);

  if (state === "exam_in_progress") {
    const userSnap = await db.collection("users").doc(uid).get();
    return {
      examStartTime: userSnap.data()?.examStartTime,
      examDeadline: userSnap.data()?.examDeadline,
      alreadyStarted: true,
    };
  }

  if (state !== "notes_validated") {
    throw new HttpsError(
      "failed-precondition",
      "La feuille de notes doit être validée avant de commencer l'épreuve."
    );
  }

  const now = admin.firestore.Timestamp.now();
  const deadline = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + EXAM_DURATION_MS
  );

  await db.collection("users").doc(uid).set(
    {
      examState: "exam_in_progress" satisfies ExamState,
      examStartTime: now,
      examDeadline: deadline,
    },
    { merge: true }
  );

  return { examStartTime: now, examDeadline: deadline, alreadyStarted: false };
});

/**
 * Soumet la lettre ouverte. Refuse toute soumission après l'échéance
 * serveur (au-delà d'une brève marge réseau) et empêche une double
 * soumission.
 */
export const submitLetter = onCall({}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const letterText: string = (request.data?.letterText ?? "").toString();
  const autoSubmitted: boolean = !!request.data?.autoSubmitted;

  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data();
  const state = (userData?.examState as ExamState) ?? "not_started";

  if (state === "exam_submitted" || state === "graded") {
    throw new HttpsError("already-exists", "La lettre a déjà été soumise.");
  }
  if (state !== "exam_in_progress") {
    throw new HttpsError(
      "failed-precondition",
      "L'épreuve chronométrée n'est pas en cours."
    );
  }

  const startedAt = userData?.examStartTime as
    | FirebaseFirestore.Timestamp
    | undefined;
  const deadline = userData?.examDeadline as
    | FirebaseFirestore.Timestamp
    | undefined;
  const now = admin.firestore.Timestamp.now();

  const GRACE_MS = 60_000;
  if (deadline && now.toMillis() > deadline.toMillis() + GRACE_MS && !autoSubmitted) {
    throw new HttpsError(
      "deadline-exceeded",
      "Le temps alloué (3h15) est écoulé."
    );
  }

  if (letterText.trim().length === 0) {
    throw new HttpsError("invalid-argument", "La lettre est vide.");
  }

  const submission = {
    letterText,
    wordCount: countWords(letterText),
    startedAt: startedAt ?? now,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    autoSubmitted,
  };

  await db.runTransaction(async (tx) => {
    tx.set(db.collection("submissions").doc(uid), submission);
    tx.set(
      db.collection("users").doc(uid),
      { examState: "exam_submitted" satisfies ExamState },
      { merge: true }
    );
  });

  return { received: true, wordCount: submission.wordCount };
});

/**
 * Correction automatisée selon la grille ministérielle à 5 critères,
 * incluant la pénalité pour 35 erreurs de langue ou plus (critères 3, 4, 5
 * mis à zéro), appliquée côté serveur indépendamment du modèle.
 */
export const gradeLetter = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const state = await getExamState(uid);

    if (state === "graded") {
      const existing = await db.collection("corrections").doc(uid).get();
      return { correction: existing.data(), alreadyGraded: true };
    }
    if (state !== "exam_submitted") {
      throw new HttpsError(
        "failed-precondition",
        "La lettre doit être soumise avant d'être corrigée."
      );
    }

    const [submissionSnap, corpusSnap] = await Promise.all([
      db.collection("submissions").doc(uid).get(),
      db.collection("corpora").doc(uid).get(),
    ]);
    const submission = submissionSnap.data();
    const corpus = corpusSnap.data() as Corpus | undefined;
    if (!submission || !corpus) {
      throw new HttpsError("failed-precondition", "Soumission introuvable.");
    }

    const raw = await askClaudeForJSON<RawGradingModelOutput>({
      system: GRADING_SYSTEM_PROMPT,
      user: buildGradingUserPrompt(submission.letterText, corpus.question),
      maxTokens: 4000,
    });

    const correction = applyGradingRules(raw);

    await db.runTransaction(async (tx) => {
      tx.set(db.collection("corrections").doc(uid), correction);
      tx.set(
        db.collection("users").doc(uid),
        { examState: "graded" satisfies ExamState },
        { merge: true }
      );
    });

    return { correction, alreadyGraded: false };
  }
);

/**
 * Petite fonction utilitaire pour que le client connaisse la durée
 * officielle de l'épreuve (3h15) sans dupliquer la constante côté web.
 */
export const getExamConfig = onCall({}, async () => {
  return { examDurationMs: EXAM_DURATION_MS };
});
