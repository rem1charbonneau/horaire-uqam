# Horaire UQAM, hiver 2027

Générateur d'horaires pour le BAA, concentration finance (7111), à l'UQAM. Les horaires, modalités, campus et places viennent de la Recherche de cours de l'UQAM et sont relus automatiquement toutes les heures, sans intervention.

## Comment ça marche

- `index.html` : le site (aucun serveur, tout se calcule dans le navigateur). Tes choix (cours, filtres, quarts de travail, favoris) sont gardés dans ton navigateur seulement.
- `scrape.js` : ouvre la fiche de chaque cours de `courses.txt` dans un navigateur automatisé, entre le code de programme 7111 et lit les places restantes. Une page à la fois, avec une pause, pour ne pas surcharger le site de l'UQAM.
- `.github/workflows/update.yml` : toutes les heures, lance `scrape.js` puis publie le site sur GitHub Pages. Si une lecture échoue, les dernières données publiées sont conservées.

## Mise en place (une seule fois)

1. Crée un dépôt GitHub public nommé `horaire-uqam` et mets-y ces fichiers (ou demande à Claude de les y envoyer).
2. Dans le dépôt : Settings, Pages, Source : **GitHub Actions**.
3. Dans l'onglet Actions, lance «Mettre à jour les horaires et publier le site» (Run workflow). Après environ 10 minutes, le site est en ligne à `https://<ton-compte>.github.io/horaire-uqam/`.

## Entretien

- Ajouter ou retirer des cours lus : modifier `courses.txt` (un sigle par ligne) et la liste `BLOCKS` / `GRID` dans `index.html`.
- Changer la fréquence : la ligne `cron` de `update.yml`.
- GitHub désactive les tâches planifiées d'un dépôt public sans activité pendant 60 jours : un clic sur «Enable workflow» ou un petit commit les réactive.
- Autre trimestre : adapter `Hiver 2027` et l'année `2027` dans `scrape.js`.

Les places baissent au fil des inscriptions et ne sont pas garanties. Vérifie toujours sur le site de l'UQAM avant de t'inscrire.

## Relais « Actualiser maintenant » (sans jeton dans le site)
`relay/worker.js` est un Cloudflare Worker qui garde le jeton GitHub de son côté. Une fois déployé, mettre son URL dans `RELAY` au début du script de `index.html` : le bouton Actualiser fonctionne alors sur tous les appareils, sans jeton. Le relais refuse un nouveau lancement si une lecture est en cours ou date de moins de 15 minutes.
