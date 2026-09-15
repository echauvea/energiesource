# EnergieSource

Simulateur de paramétrage des sources énergétiques pour les postes de consommation mondiaux.

## Le principe

À demande énergétique constante (année de référence 2024), l'application permet de faire varier la source primaire d'énergie utilisée pour chaque poste de consommation (chaleur industrielle, transport, ciment, acier, force motrice...) et d'observer l'impact sur les émissions mondiales de CO2e.

Chaque poste peut être alimenté par plusieurs **chaînes énergétiques** (source primaire → vecteur → convertisseur), chacune avec son propre facteur d'émission. L'utilisateur répartit la demande de chaque poste entre ses chaînes disponibles ; l'application recalcule les émissions en temps réel, poste par poste et au total mondial.

## Statut

✅ v1 en production : https://energie.echauvea.com

| Lot | Contenu | Statut |
|---|---|---|
| 0 | `data.json` complet, 11 postes | ✅ |
| 1 | Moteur de calcul (`model.js`) | ✅ |
| 2 | Interface (curseurs, total) | ✅ |
| 3 | Partage par URL, étiquettes épistémiques | ✅ |
| 4 | Déploiement | ✅ |

## Stack

- HTML + JS (ES modules), sans framework
- `data.json` comme unique source de données, séparé du code et versionné
- Site statique, aucun calcul serveur

## Structure

```
/
├── index.html
├── data.json
├── css/style.css
└── js/
    ├── model.js
    ├── model.test.js
    ├── ui.js
    ├── url.js
    └── url.test.js
```

Tests : `npm test` (runner natif de Node, aucune dépendance).

## Données

`data.json` recense 11 postes de consommation énergétique mondiaux et leurs chaînes de production associées (source primaire, vecteur, convertisseur, facteur d'émission, répartition 2024). Chaque valeur porte une étiquette de fiabilité :

- `ETABLI` — cité directement depuis une source primaire unique et fiable
- `ROBUSTE` — reconstruit à partir de plusieurs sources recoupées entre elles
- `DEBATTU` — chiffre non contesté, mais méthode de comptage débattue scientifiquement
- `A_SOURCER` — estimation de travail, pas encore vérifiée
