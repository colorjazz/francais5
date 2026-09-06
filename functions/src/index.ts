import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { askGeminiForJSON, geminiApiKey } from "./gemini";
import {
  buildCorpusUserPrompt,
  buildDiscussionSynthesisUserPrompt,
  buildDiscussionUserPrompt,
  buildGradingUserPrompt,
  buildNotesValidationUserPrompt,
  buildReadingFeedbackUserPrompt,
  CORPUS_SYSTEM_PROMPT,
  DISCUSSION_SYNTHESIS_SYSTEM_PROMPT,
  DISCUSSION_SYSTEM_PROMPT,
  GRADING_SYSTEM_PROMPT,
  NOTES_VALIDATION_SYSTEM_PROMPT,
  READING_FEEDBACK_SYSTEM_PROMPT,
} from "./prompts";
import { applyGradingRules } from "./grading";
import {
  ArgumentType,
  Corpus,
  CorpusKey,
  Discussion,
  DiscussionMessage,
  ExamMode,
  ExamState,
  NotesValidation,
  PointDeVue,
  RawCorpusResponse,
  RawGradingModelOutput,
  RawReadingFeedback,
  ReadingAnalysisEntry,
} from "./types";

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "northamerica-northeast1", maxInstances: 10 });

/** Durée officielle de l'épreuve d'écriture : 3 heures 15 minutes. */
const EXAM_DURATION_MS = (3 * 60 + 15) * 60 * 1000;

/** Nombre maximal de tours de parole de l'élève dans la discussion préparatoire (section B). */
const DISCUSSION_MAX_TURNS = 6;

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

function summarizePointsDeVue(corpus: Corpus, corpusKey: CorpusKey | undefined): string {
  if (!corpusKey) return "(voir les textes du dossier)";
  return corpus.texts
    .map((t) => {
      const key = corpusKey.texts.find((k) => k.textId === t.id);
      return key ? `« ${t.title} » — ${key.pointDeVue}` : null;
    })
    .filter((s): s is string => !!s)
    .join(" ; ");
}

/**
 * Jour 1 : génère le dossier préparatoire (corpus) une seule fois par
 * élève, puis le fige en base. Les appels suivants renvoient le même
 * corpus déjà stocké, ce qui garantit que l'élève retrouve exactement les
 * mêmes textes en se reconnectant les jours suivants.
 */
export const generateCorpus = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const existing = await db.collection("corpora").doc(uid).get();
    if (existing.exists) {
      return { corpus: existing.data(), alreadyExisted: true };
    }

    const topic: string | undefined = request.data?.topic;
    const raw = await askGeminiForJSON<RawCorpusResponse>({
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

    // Le corpus public (lu par le client) ne contient jamais la clé de
    // correction (thèse réelle, point de vue, type des arguments) : elle
    // est stockée séparément, dans une collection que les règles Firestore
    // refusent en lecture au client, pour que les exercices de la section
    // « Lire et apprécier » restent formatifs plutôt que trivialement
    // consultables.
    const corpus: Corpus = {
      topic: raw.topic,
      question: raw.question,
      texts: raw.texts.map((t) => ({
        id: t.id,
        title: t.title,
        author: t.author,
        type: t.type,
        genre: t.genre,
        content: t.content,
        publication: t.publication,
        arguments: t.arguments.map((a) => ({ id: a.id, extrait: a.extrait })),
      })),
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const corpusKey: CorpusKey = {
      texts: raw.texts.map((t) => ({
        textId: t.id,
        these: t.these,
        pointDeVue: t.pointDeVue,
        pointDeVueJustification: t.pointDeVueJustification,
        credibiliteNotes: t.credibiliteNotes,
        argumentTypes: t.arguments.map((a) => ({ id: a.id, type: a.type })),
      })),
    };

    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
      tx.set(db.collection("corpora").doc(uid), corpus);
      tx.set(db.collection("corpusKeys").doc(uid), corpusKey);
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
  { secrets: [geminiApiKey] },
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

    const rawResult = await askGeminiForJSON<
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
 * Démarre officiellement l'épreuve chronométrée (3h15), dans l'un de deux
 * modes choisis par l'élève :
 * - "entrainement" : l'élève peut quitter (pauseExam / resumeExam) et le
 *   chronomètre s'arrête pendant son absence.
 * - "simulation" : conditions réelles — aucune pause possible, quoi que
 *   fasse l'élève côté client ; seul ce serveur fait foi pour l'échéance.
 * L'heure de départ et l'échéance sont fixées côté serveur pour empêcher
 * toute manipulation du chronomètre par le client.
 */
export const startExam = onCall({}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const state = await getExamState(uid);

  if (state === "exam_in_progress") {
    const userSnap = await db.collection("users").doc(uid).get();
    const data = userSnap.data();
    return {
      examStartTime: data?.examStartTime,
      examDeadline: data?.examDeadline,
      examMode: data?.examMode,
      examRunning: data?.examRunning,
      examRemainingMs: data?.examRemainingMs,
      alreadyStarted: true,
    };
  }

  if (state !== "notes_validated") {
    throw new HttpsError(
      "failed-precondition",
      "La feuille de notes doit être validée avant de commencer l'épreuve."
    );
  }

  const mode = request.data?.mode as ExamMode | undefined;
  if (mode !== "entrainement" && mode !== "simulation") {
    throw new HttpsError(
      "invalid-argument",
      "Choisis le mode « entraînement » ou « simulation d'examen »."
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
      examMode: mode,
      examRunning: true,
      examRemainingMs: EXAM_DURATION_MS,
    },
    { merge: true }
  );

  return {
    examStartTime: now,
    examDeadline: deadline,
    examMode: mode,
    examRunning: true,
    examRemainingMs: EXAM_DURATION_MS,
    alreadyStarted: false,
  };
});

/**
 * Met le chronomètre en pause (mode "entrainement" seulement) lorsque
 * l'élève quitte la session d'écriture. Le temps restant est figé côté
 * serveur ; le mode "simulation" refuse systématiquement cet appel.
 */
export const pauseExam = onCall({}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  const data = snap.data();

  if ((data?.examState as ExamState) !== "exam_in_progress") {
    throw new HttpsError(
      "failed-precondition",
      "Aucune épreuve en cours à mettre en pause."
    );
  }
  if (data?.examMode !== "entrainement") {
    throw new HttpsError(
      "permission-denied",
      "Le mode simulation d'examen ne permet pas de mettre le chronomètre en pause."
    );
  }
  if (data?.examRunning === false) {
    return { examRemainingMs: data?.examRemainingMs ?? 0, alreadyPaused: true };
  }

  const deadline = data?.examDeadline as FirebaseFirestore.Timestamp | undefined;
  const now = admin.firestore.Timestamp.now();
  const remaining = Math.max(0, (deadline?.toMillis() ?? now.toMillis()) - now.toMillis());

  await userRef.set(
    { examRunning: false, examRemainingMs: remaining },
    { merge: true }
  );

  return { examRemainingMs: remaining, alreadyPaused: false };
});

/**
 * Reprend le chronomètre (mode "entrainement" seulement) là où il avait
 * été mis en pause : une nouvelle échéance est recalculée côté serveur à
 * partir du temps restant figé, sans jamais accorder de temps bonus.
 */
export const resumeExam = onCall({}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  const data = snap.data();

  if ((data?.examState as ExamState) !== "exam_in_progress") {
    throw new HttpsError(
      "failed-precondition",
      "Aucune épreuve en cours à reprendre."
    );
  }
  if (data?.examMode !== "entrainement") {
    throw new HttpsError(
      "permission-denied",
      "Le mode simulation d'examen ne permet pas de mettre le chronomètre en pause."
    );
  }
  if (data?.examRunning === true) {
    return { examDeadline: data?.examDeadline, alreadyRunning: true };
  }

  const remaining = Math.max(0, (data?.examRemainingMs as number | undefined) ?? 0);
  if (remaining <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Le temps alloué est écoulé : remets ta copie."
    );
  }

  const now = admin.firestore.Timestamp.now();
  const deadline = admin.firestore.Timestamp.fromMillis(now.toMillis() + remaining);

  await userRef.set(
    { examRunning: true, examDeadline: deadline },
    { merge: true }
  );

  return { examDeadline: deadline, alreadyRunning: false };
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

  // En mode entraînement, une session en pause a un temps restant figé
  // (examRemainingMs) plutôt qu'une échéance qui continue de courir : on
  // reconstitue une échéance équivalente pour réutiliser la même règle de
  // dépassement de délai ci-dessous.
  const effectiveDeadlineMs =
    userData?.examRunning === false
      ? now.toMillis() + Math.max(0, (userData?.examRemainingMs as number | undefined) ?? 0)
      : deadline?.toMillis();

  const GRACE_MS = 60_000;
  if (
    effectiveDeadlineMs !== undefined &&
    now.toMillis() > effectiveDeadlineMs + GRACE_MS &&
    !autoSubmitted
  ) {
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
  { secrets: [geminiApiKey] },
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

    const raw = await askGeminiForJSON<RawGradingModelOutput>({
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

/* ------------------------------------------------------------------ *
 * Section A — « Lire et apprécier des textes variés »
 * ------------------------------------------------------------------ */

/**
 * Corrige les réponses de l'élève à l'exercice d'analyse critique d'un
 * texte du dossier (thèse, point de vue de l'énonciateur, classification
 * des arguments, évaluation de la crédibilité de la source). La
 * classification des arguments est corrigée par comparaison déterministe
 * à la clé cachée ; la thèse, le point de vue et la crédibilité reçoivent
 * une rétroaction générée par le modèle. Purement formatif — ne fait pas
 * partie de la note de l'épreuve.
 */
export const submitReadingAnalysis = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const textId: string = (request.data?.textId ?? "").toString();
    const theseProposee: string = (request.data?.theseProposee ?? "")
      .toString()
      .trim();
    const pointDeVueChoisi = request.data?.pointDeVueChoisi as
      | PointDeVue
      | undefined;
    const pointDeVueJustificationEleve: string = (
      request.data?.pointDeVueJustification ?? ""
    ).toString();
    const credibiliteReponse: string = (
      request.data?.credibiliteReponse ?? ""
    ).toString();
    const argumentClassifications = (request.data?.argumentClassifications ??
      []) as { id: string; type: ArgumentType }[];

    if (!textId || theseProposee.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Réponds à l'exercice avant de le vérifier."
      );
    }
    if (
      pointDeVueChoisi !== "favorable" &&
      pointDeVueChoisi !== "defavorable" &&
      pointDeVueChoisi !== "nuance"
    ) {
      throw new HttpsError("invalid-argument", "Choisis un point de vue valide.");
    }

    const [corpusSnap, keySnap] = await Promise.all([
      db.collection("corpora").doc(uid).get(),
      db.collection("corpusKeys").doc(uid).get(),
    ]);
    const corpus = corpusSnap.data() as Corpus | undefined;
    const corpusKey = keySnap.data() as CorpusKey | undefined;
    if (!corpus || !corpusKey) {
      throw new HttpsError(
        "failed-precondition",
        "Le dossier préparatoire n'a pas encore été généré."
      );
    }
    const text = corpus.texts.find((t) => t.id === textId);
    const key = corpusKey.texts.find((t) => t.textId === textId);
    if (!text || !key) {
      throw new HttpsError("not-found", "Texte introuvable dans le dossier.");
    }

    const argumentResults = key.argumentTypes.map((correct) => {
      const submitted = argumentClassifications.find((a) => a.id === correct.id);
      const propose = submitted?.type ?? ("opinion" as ArgumentType);
      return {
        id: correct.id,
        propose,
        correct: correct.type,
        estCorrect: propose === correct.type,
      };
    });
    const argumentScore = argumentResults.length
      ? Math.round(
          (argumentResults.filter((r) => r.estCorrect).length /
            argumentResults.length) *
            100
        )
      : 100;

    const raw = await askGeminiForJSON<RawReadingFeedback>({
      system: READING_FEEDBACK_SYSTEM_PROMPT,
      user: buildReadingFeedbackUserPrompt({
        texteTitle: text.title,
        texteAuteur: text.author,
        texteType: text.type,
        these: key.these,
        pointDeVue: key.pointDeVue,
        pointDeVueJustification: key.pointDeVueJustification,
        credibiliteNotes: key.credibiliteNotes,
        theseProposee,
        pointDeVueChoisi,
        pointDeVueJustificationEleve,
        credibiliteReponse,
      }),
      maxTokens: 1200,
    });

    const theseComponent = raw.theseCorrecte ? 100 : 50;
    const pointDeVueComponent = raw.pointDeVueCorrect ? 100 : 50;
    const score = Math.round(
      (theseComponent + pointDeVueComponent + argumentScore) / 3
    );

    const entry: ReadingAnalysisEntry = {
      theseProposee,
      theseFeedback: raw.theseFeedback,
      theseCorrecte: raw.theseCorrecte,
      pointDeVueChoisi,
      pointDeVueFeedback: raw.pointDeVueFeedback,
      pointDeVueCorrect: raw.pointDeVueCorrect,
      argumentResults,
      argumentScore,
      credibiliteReponse,
      credibiliteFeedback: raw.credibiliteFeedback,
      score,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db
      .collection("readingAnalyses")
      .doc(uid)
      .set({ [textId]: entry }, { merge: true });

    return { entry };
  }
);

/* ------------------------------------------------------------------ *
 * Section B — « Communiquer oralement selon des modalités variées »
 * ------------------------------------------------------------------ */

/**
 * Démarre la discussion préparatoire : l'élève énonce la thèse qu'il ou
 * elle défend pour l'instant, et l'IA (un « pair ») ouvre le débat avec
 * une première objection ou question.
 */
export const startDiscussion = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const these: string = (request.data?.these ?? "").toString().trim();
    if (these.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Indique la thèse que tu défends pour l'instant."
      );
    }

    const [corpusSnap, keySnap] = await Promise.all([
      db.collection("corpora").doc(uid).get(),
      db.collection("corpusKeys").doc(uid).get(),
    ]);
    const corpus = corpusSnap.data() as Corpus | undefined;
    const corpusKey = keySnap.data() as CorpusKey | undefined;
    if (!corpus) {
      throw new HttpsError(
        "failed-precondition",
        "Le dossier préparatoire n'a pas encore été généré."
      );
    }

    const raw = await askGeminiForJSON<{ reponse: string }>({
      system: DISCUSSION_SYSTEM_PROMPT,
      user: buildDiscussionUserPrompt({
        corpusQuestion: corpus.question,
        pointsDeVueDossier: summarizePointsDeVue(corpus, corpusKey),
        these,
        historique: [],
        dernierMessage: these,
        tour: 1,
        tourMax: DISCUSSION_MAX_TURNS,
      }),
      maxTokens: 600,
    });

    const now = admin.firestore.Timestamp.now();
    const discussion: Discussion = {
      these,
      messages: [{ role: "ia", texte: raw.reponse, at: now }],
      startedAt: now,
      updatedAt: now,
    };
    await db.collection("discussions").doc(uid).set(discussion);

    return { discussion };
  }
);

/**
 * Un tour de la discussion : l'élève répond à l'objection précédente, et
 * l'IA relance avec une nouvelle objection, un contre-argument ou une
 * question, jusqu'au nombre maximal de tours.
 */
export const discussionReply = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const message: string = (request.data?.message ?? "").toString().trim();
    if (message.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Écris une réponse avant de l'envoyer."
      );
    }

    const [discSnap, corpusSnap, keySnap] = await Promise.all([
      db.collection("discussions").doc(uid).get(),
      db.collection("corpora").doc(uid).get(),
      db.collection("corpusKeys").doc(uid).get(),
    ]);
    const discussion = discSnap.data() as Discussion | undefined;
    const corpus = corpusSnap.data() as Corpus | undefined;
    const corpusKey = keySnap.data() as CorpusKey | undefined;
    if (!discussion || !corpus) {
      throw new HttpsError(
        "failed-precondition",
        "Commence la discussion avant d'y répondre."
      );
    }
    if (discussion.synthese) {
      throw new HttpsError(
        "failed-precondition",
        "Cette discussion est déjà terminée."
      );
    }

    const tourActuel = Math.floor(discussion.messages.length / 2) + 1;
    if (tourActuel > DISCUSSION_MAX_TURNS) {
      throw new HttpsError(
        "failed-precondition",
        "Cette discussion a atteint son nombre maximal de tours. Termine-la pour obtenir ta synthèse."
      );
    }

    const raw = await askGeminiForJSON<{ reponse: string }>({
      system: DISCUSSION_SYSTEM_PROMPT,
      user: buildDiscussionUserPrompt({
        corpusQuestion: corpus.question,
        pointsDeVueDossier: summarizePointsDeVue(corpus, corpusKey),
        these: discussion.these,
        historique: discussion.messages.map((m) => ({
          role: m.role,
          texte: m.texte,
        })),
        dernierMessage: message,
        tour: tourActuel,
        tourMax: DISCUSSION_MAX_TURNS,
      }),
      maxTokens: 600,
    });

    const now = admin.firestore.Timestamp.now();
    const newMessages: DiscussionMessage[] = [
      ...discussion.messages,
      { role: "eleve", texte: message, at: now },
      { role: "ia", texte: raw.reponse, at: now },
    ];

    await db
      .collection("discussions")
      .doc(uid)
      .set({ messages: newMessages, updatedAt: now }, { merge: true });

    return { reponse: raw.reponse, tour: tourActuel, tourMax: DISCUSSION_MAX_TURNS };
  }
);

/**
 * Termine la discussion et produit une synthèse formative (non notée) qui
 * aide l'élève à passer à la rédaction de sa lettre ouverte.
 */
export const endDiscussion = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const discSnap = await db.collection("discussions").doc(uid).get();
    const discussion = discSnap.data() as Discussion | undefined;
    if (!discussion) {
      throw new HttpsError("failed-precondition", "Aucune discussion à conclure.");
    }
    if (discussion.synthese) {
      return { synthese: discussion.synthese, alreadyEnded: true };
    }

    const raw = await askGeminiForJSON<{ synthese: string }>({
      system: DISCUSSION_SYNTHESIS_SYSTEM_PROMPT,
      user: buildDiscussionSynthesisUserPrompt({
        these: discussion.these,
        historique: discussion.messages.map((m) => ({
          role: m.role,
          texte: m.texte,
        })),
      }),
      maxTokens: 600,
    });

    await db
      .collection("discussions")
      .doc(uid)
      .set(
        {
          synthese: raw.synthese,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return { synthese: raw.synthese, alreadyEnded: false };
  }
);
