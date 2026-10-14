# Déploiement GitHub Pages

Dépôt : [mathieugirardin-cmd/fly-operator-simulator](https://github.com/mathieugirardin-cmd/fly-operator-simulator), branche principale `main`.

Site : [F.L.Y. Operator Simulator](https://mathieugirardin-cmd.github.io/fly-operator-simulator/). GitHub Pages utilise déjà la source **GitHub Actions**. La publication de la version 0.5 est autorisée par la demande du 14 octobre 2026. Le dépôt local est rattaché à `origin` et conserve l’historique existant.

## Mettre à jour le jeu

1. Modifier les sources du projet et vérifier les tests et la compilation.
2. Enregistrer puis envoyer les changements sur `main`, ou fusionner une pull request vérifiée.
3. Ouvrir [Vérifier et publier le simulateur](https://github.com/mathieugirardin-cmd/fly-operator-simulator/actions/workflows/deploy.yml). Attendre la réussite des tâches `build` et `deploy` pour le commit envoyé.
4. Ouvrir le site et vérifier les commandes et le chargement des ressources. Un rafraîchissement complet peut être nécessaire si l’ancienne version reste affichée.

Seuls les sources, les ressources publiques et la documentation sont versionnés. `dist`, `node_modules`, `.qa` et les archives locales sont exclus. GitHub reconstruit `dist` à chaque déploiement : aucune installation de Node.js n’est nécessaire pour jouer.

Ces étapes suivent la documentation GitHub sur [la création de dépôt](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository), [la source Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) et [les workflows personnalisés](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Travail futur avec Codex

Pour un environnement cloud, créer ou choisir un environnement dans Codex, connecter GitHub si demandé, sélectionner ce dépôt et laisser Codex préparer les dépendances. Examiner les vérifications avant d’utiliser l’environnement. Les changements peuvent ensuite être examinés et proposés en pull request. Voir la [documentation officielle Codex Cloud](https://learn.chatgpt.com/docs/cloud). Aucun jeton ne doit être copié dans les fichiers du jeu.

## Ce que fait le workflow

`.github/workflows/deploy.yml` utilise Node.js 22 et `npm ci`, exécute `npm test`, compile avec `npm run build`, puis transfère `dist` à GitHub Pages. Les pull requests sont vérifiées sans déploiement. Seule la branche par défaut peut publier ; les branches usuelles `main` et `master` déclenchent les contrôles. Les permissions d’écriture Pages sont limitées à la tâche de déploiement. Les déploiements concurrents d’une même branche sont sérialisés.

Le workflow met à jour Pages après chaque envoi sur la branche principale. Le jeu lui-même n’utilise ni backend, ni secret, ni synchronisation de sauvegardes. Les identifiants GitHub ne doivent jamais être ajoutés au projet.

Vite calcule le préfixe depuis `GITHUB_REPOSITORY` pendant GitHub Actions, soit `/fly-operator-simulator/` pour ce dépôt. Les chemins locaux de développement sont relatifs. Aucun chemin Windows ne doit apparaître dans les ressources publiées.
