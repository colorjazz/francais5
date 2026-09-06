# Aperçu — Cahier d'écriture

`apercu.html` est une maquette interactive autonome (HTML/CSS/JS pur, sans
dépendance) du parcours complet de la plateforme : dossier préparatoire,
section A (analyse critique), section B (discussion préparatoire avec un
pair simulé), feuille de notes, choix de mode et rédaction chronométrée,
et correction à cinq critères.

Elle utilise des **données fictives et une logique simulée côté client**
(pas d'appel à Firebase ni à une API d'IA) — c'est un outil de démonstration
et de revue du design, pas l'application elle-même. L'application réelle
vit dans `web/` (frontend) et `functions/` (Cloud Functions).

Pour la consulter, ouvrez simplement `apercu.html` dans un navigateur, ou
servez le dossier avec n'importe quel serveur statique :

```bash
npx serve preview
```
