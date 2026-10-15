# Évolutions 0.6 — validation et publication

Le projet existant est conservé. La publication de la version 0.6 est demandée le 15 octobre 2026. Le [workflow GitHub Actions](https://github.com/mathieugirardin-cmd/fly-operator-simulator/actions/workflows/deploy.yml) exécute les tests, la compilation puis le déploiement Pages ; le site conserve le dernier déploiement réussi.

## Fonctionnement

- Plan SVG connecté : personnes issues du moteur, sprites réutilisés, trajets et réservations, capacités lisibles, commandes des portes et de la séance. Vert : ouvert ; rouge : fermé ; symbole et libellé accompagnent la couleur.
- Préshow : remplissage, séance avec temps `mm:ss`, vidage progressif et reprise après saturation. Les personnes déjà engagées restent visibles pendant leur trajet, y compris en 3D. Deux places des casiers restent protégées pour les retours de sécurité. Éclairage et musique suivent le temps simulé.
- Arrivées totales partagées : 20 % Fast Pass par défaut, proportion et débit configurables dans Réglages. La fusion conserve le FIFO de chaque file ; le ratio configurable réserve une part aux deux files.
- Score : 10 points à la sortie après tour et récupération ; 20 si l’attente jusqu’à l’installation dans le train est strictement inférieure à 600 secondes. Aucun gain pour un test ou une sortie sans tour. Bonus d’incident unique à la remise en service, jamais à l’acquittement. Barème dans `src/systems/ScoreSystem.js`.
- Sons originaux Web Audio : portes, retenues, départ, fanfare et musique. Contexte créé après interaction ; volumes général/musique et sourdine enregistrés. Pause et onglet masqué suspendent l’audio. Aucun fichier musical externe.
- Pupitre : mouvements de portiques et harnais de 0,8 seconde simulée, confirmations invalidées à la réouverture, couleurs demandées et départ vert clignotant uniquement si toutes les validations passent.
- Clavier en mode manuel : ↑ ouvrir les portiques ; ↓ fermer ; → charger ; Espace inverser les harnais après leur mouvement ; Entrée confirmer le quai, puis nouvel appui distinct pour envoyer. Relâchement obligatoire ; répétitions, champs, menus et fenêtres modales exclus.
- Pause et vitesses ×0,5 / ×1 / ×2 / ×4. Sauvegardes V1–V5 validées puis migrées vers V6 ; score et attentes en cours conservés dans les nouvelles parties. Les parcours anciens dont l’attente est inconnue ne reçoivent pas le bonus d’attente rapide ; aucun score rétroactif pour les sorties déjà terminées.

## Vérifications

- Suite complète : **150 tests réussis, 12 fichiers**.
- Après les derniers changements du moteur : **98 tests ciblés réussis**, couvrant sauvegardes, migrations, casiers, files, service, score, audio et clavier.
- Préshow vide entièrement ; aval libre puis saturé et débloqué ; conservation des identités et respect des capacités ; pause et reprise sans relancer la séance.
- 60 arrivées/minute à 25 % Fast Pass donnent exactement 45 standard et 15 Fast Pass, sans doublon ; admission et traitement effectifs.
- Attente 9:59 : 20 points ; 10:00 : 10 points ; sortie et bonus uniques ; acquittement sans gain ; sauvegarde/reprise du score.
- Commandes de départ et mouvements bloquants, deux appuis Entrée avec relâchement, répétitions ignorées ; tests audio avec contexte simulé pour volumes, sourdine, pause et absence de doublons.
- Compilation de production Vite réussie. L’avertissement de taille du module Three.js reste présent ; il ne bloque pas le build.
- Navigateur Chromium intégré : démarrage de la compilation, restauration de partie, visiteurs Fast Pass visibles, fermeture/réouverture du passage des casiers depuis le plan, sourdine et score affiché. Formats 1366×768, 1536×864 et 1920×1080 : pas de défilement de page ; départ situé au-dessus du pied de panneau.

Captures : [1366×768](pupitre-0.6-1366x768.png), [1536×864](pupitre-0.6-1536x864.png), [1920×1080](pupitre-0.6-1920x1080.png). La partie de contrôle montre une saturation et des incidents simulés ; ce sont des états du jeu.

## Limites

La qualité sonore n’a pas fait l’objet d’une écoute humaine comparative. Les contrôles d’audio et de touches maintenues sont automatisés ; ils ne constituent pas une validation séparée sur Chrome et Edge. Le cycle plein écran natif et les performances sur d’autres postes restent à vérifier. Le tracé et les procédures restent des conventions fictives de jeu.
