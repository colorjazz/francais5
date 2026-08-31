import { CriterionResult, GradingResult, RawGradingModelOutput } from "./types";
import * as admin from "firebase-admin";

/**
 * Seuil ministériel : à partir de 35 erreurs de langue (orthographe,
 * syntaxe/ponctuation et vocabulaire confondus), l'élève perd la totalité
 * des points associés aux critères 3 (vocabulaire), 4 (syntaxe et
 * ponctuation) et 5 (orthographe), quelle que soit la qualité par ailleurs.
 */
export const ERROR_PENALTY_THRESHOLD = 35;

const MAX_POINTS = {
  adaptation: 30,
  coherence: 20,
  vocabulaire: 5,
  syntaxe: 25,
  orthographe: 20,
} as const;

function clamp(points: number, max: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.max(0, Math.min(max, Math.round(points)));
}

/**
 * Applies the ministerial error-count penalty on top of the model's raw
 * per-criterion scores. Kept as pure, server-side, non-AI logic so the
 * penalty is always enforced exactly, independent of what the grading
 * model itself may or may not have applied.
 */
export function applyGradingRules(raw: RawGradingModelOutput): GradingResult {
  const totalErrors = Math.max(0, Math.round(raw.totalErrors) || 0);
  const penaltyApplied = totalErrors >= ERROR_PENALTY_THRESHOLD;

  const adaptation: CriterionResult = {
    label: "Adaptation à la situation de communication",
    maxPoints: MAX_POINTS.adaptation,
    points: clamp(raw.adaptation.points, MAX_POINTS.adaptation),
    penalized: false,
    feedback: raw.adaptation.feedback,
  };

  const coherence: CriterionResult = {
    label: "Cohérence du texte",
    maxPoints: MAX_POINTS.coherence,
    points: clamp(raw.coherence.points, MAX_POINTS.coherence),
    penalized: false,
    feedback: raw.coherence.feedback,
  };

  const vocabulaire: CriterionResult = {
    label: "Vocabulaire",
    maxPoints: MAX_POINTS.vocabulaire,
    points: penaltyApplied ? 0 : clamp(raw.vocabulaire.points, MAX_POINTS.vocabulaire),
    penalized: penaltyApplied,
    feedback: raw.vocabulaire.feedback,
  };

  const syntaxe: CriterionResult = {
    label: "Construction des phrases et ponctuation",
    maxPoints: MAX_POINTS.syntaxe,
    points: penaltyApplied ? 0 : clamp(raw.syntaxe.points, MAX_POINTS.syntaxe),
    penalized: penaltyApplied,
    feedback: raw.syntaxe.feedback,
  };

  const orthographe: CriterionResult = {
    label: "Orthographe",
    maxPoints: MAX_POINTS.orthographe,
    points: penaltyApplied ? 0 : clamp(raw.orthographe.points, MAX_POINTS.orthographe),
    penalized: penaltyApplied,
    feedback: raw.orthographe.feedback,
  };

  const totalScore =
    adaptation.points +
    coherence.points +
    vocabulaire.points +
    syntaxe.points +
    orthographe.points;

  return {
    criteria: { adaptation, coherence, vocabulaire, syntaxe, orthographe },
    totalErrors,
    penaltyApplied,
    totalScore,
    maxScore: 100,
    synthese: raw.synthese,
    gradedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}
