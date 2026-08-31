# Section C — Simulation de l'épreuve unique de français (5e secondaire)

Plateforme web reproduisant la préparation et le passage de l'épreuve
unique ministérielle d'écriture de français, langue d'enseignement, 5e
secondaire (Québec) : réception d'un dossier préparatoire généré par IA,
feuille de notes avec sauvegarde en temps réel et validation de conformité,
puis rédaction chronométrée (3 h 15) d'une lettre ouverte, corrigée
automatiquement selon la grille ministérielle à cinq critères.

## Architecture

- **`web/`** — Frontend React + TypeScript + Vite + Tailwind CSS.
  Authentification, lecture du dossier, éditeur de la feuille de notes,
  module d'écriture chronométré, affichage des résultats.
- **`functions/`** — Cloud Functions (Firebase, Node/TypeScript) qui
  appellent l'API Claude (Anthropic) pour générer le corpus, valider la
  feuille de notes et corriger la lettre ouverte, et qui appliquent
  côté serveur les règles non négociables (délai de 3 h 15, seuil de
  35 erreurs).
- **Firestore** — persistance : `users/{uid}` (état de progression),
  `corpora/{uid}` (dossier figé après génération), `notes/{uid}`
  (feuille de notes, sauvegarde en temps réel), `validations/{uid}`,
  `submissions/{uid}`, `corrections/{uid}`.
- **`firestore.rules`** — Le corpus, les validations, les soumissions et
  les corrections ne sont écrits que par les Cloud Functions (Admin SDK) ;
  seule la feuille de notes est modifiable directement par l'élève, pour
  permettre la sauvegarde en temps réel.

## Flux pédagogique

1. **Jour 1** — L'élève se connecte et déclenche `generateCorpus`. Le
   dossier (5 à 8 textes courants et littéraires sur une question à
   controverse) est généré une seule fois et figé dans Firestore.
2. **Jours suivants** — En se reconnectant, l'élève retrouve exactement
   le même dossier et poursuit sa feuille de notes à son rythme
   (sauvegarde automatique).
3. **Jour de l'évaluation** — L'élève soumet sa feuille de notes à
   `validateNotes`, qui vérifie le style télégraphique et l'absence de
   texte suivi déjà rédigé. Une fois la feuille conforme, `startExam`
   fixe côté serveur l'heure de début et l'échéance (3 h 15). L'élève
   rédige sa lettre ouverte ; `submitLetter` refuse toute soumission
   après l'échéance (hors petite marge réseau) et empêche la double
   soumission.
4. **Correction** — `gradeLetter` applique la grille officielle à cinq
   critères (adaptation 30 %, cohérence 20 %, vocabulaire 5 %, syntaxe et
   ponctuation 25 %, orthographe 20 %) et, si le nombre d'erreurs relevées
   atteint 35, ramène à zéro les critères vocabulaire, syntaxe/ponctuation
   et orthographe — cette pénalité est appliquée par du code serveur
   déterministe (`functions/src/grading.ts`), indépendamment de ce que le
   modèle propose, pour garantir qu'elle est toujours respectée.

## Démarrage

### Prérequis

- Node.js 20+
- Un projet Firebase (Auth par courriel/mot de passe + Firestore activés)
- Une clé API Anthropic (Claude)
- La CLI Firebase (`npm i -g firebase-tools`)

### Configuration

```bash
# Identifiant du projet Firebase
firebase use --add   # ou éditez .firebaserc directement

# Frontend
cp web/.env.example web/.env.local
# remplissez web/.env.local avec la config SDK de votre app Firebase

# Cloud Functions — clé API stockée comme secret (jamais commitée)
firebase functions:secrets:set ANTHROPIC_API_KEY
```

### Développement local

```bash
# Cloud Functions
cd functions && npm install && npm run build

# Frontend
cd web && npm install && npm run dev
```

Pour tester avec les émulateurs Firebase (Auth, Firestore, Functions) :

```bash
firebase emulators:start
```

### Déploiement

```bash
firebase deploy --only firestore:rules,functions,hosting
```

## Notes de conception

- Le brouillon de la lettre pendant l'épreuve chronométrée est conservé
  dans `localStorage` (par élève, par navigateur) afin de survivre à un
  rafraîchissement de page ; la soumission officielle, elle, passe
  toujours par la Cloud Function `submitLetter`, qui horodate côté
  serveur et fait foi.
- Les textes du dossier préparatoire sont des créations originales
  générées par le modèle (jamais des extraits d'œuvres protégées
  attribués à de vrais auteurs), pour éviter tout problème de droit
  d'auteur tout en respectant la structure d'un vrai dossier ministériel.
