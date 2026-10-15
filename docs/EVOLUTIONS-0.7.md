# Version 0.7 — validation et publication

Date : 15 octobre 2026. Publication demandée sur le dépôt existant ; le workflow contrôle les tests et le build avant GitHub Pages.

## Changements

- Plan SVG industriel dynamique inspiré de la maquette fournie : murs, sols, plaques, casiers, seuils, trois files, attente séparée, vingt sièges lisibles, retour distinct. Le plan conserve ses proportions ; la maquette n’est pas utilisée comme interface statique.
- Colonne gauche supprimée du poste principal, commandes conservées dans les pièces et le tiroir. Pupitre de départ permanent. Embarquement agrandi par déplacement du même panneau caméra ; fermeture avec restauration du point de vue précédent.
- Pool de personnages lié à visitorId, emplacements d’attente stables et départ depuis la position courante, dans le plan et les salles Three.js. Embarquement visuel individuel. Associations nettoyées sur nouvelle partie/restauration.
- Trois files réelles : arrivées pondérées sans augmenter le débit total, capacités/ouvertures configurables, identité Single Rider conservée jusqu’à la gare. Casier et sécurité restent obligatoires. En gare, les personnes Standard/Fast Pass prêtes sont prioritaires, puis les Single Riders remplissent les places restantes.
- Complément du préshow par sièges : 37 personnes prévues et des trains de 20 donnent un besoin de 3. Réservation de personnes existantes, admission progressive en remplissage, plafond de capacité et clics répétés sans sur-réservation. Le calcul ne simule aucune famille.
- Scanner Fast Pass automatique ou manuel, consommation unique au franchissement, blocage des passes invalides/utilisés, réorientation conservant ID et heure d’arrivée. Les statuts de passes restent une convention de jeu, sans système de billetterie réel.
- Contrôleur YouTube distinct de l’audio local : playlist configurable, sélection du morceau par URL/ID ou liste chargée, exclusion de l’ambiance, mémorisation de la piste/position et retour après séance. Aucun téléchargement ou backend. Pause du jeu/onglet/incident et dialogues pris en compte ; vitesse du jeu indépendante du lecteur.
- Sauvegarde v8 validée, migration de v6/v7 avec conservation des personnes, casiers, score et trains. Seuls les réglages YouTube sont persistés. Les anciennes sauvegardes v6 gardent leur proportion Single Rider à zéro pour ne pas modifier leurs arrivées.

## Tests automatiques

`npm test -- --reporter=dot` : **168 tests réussis, 15 fichiers**. Les 150 tests existants restent verts ; 18 tests ciblent les admissions, la migration, les pools de personnages et le contrôleur YouTube simulé (y compris le chargement asynchrone d’une piste, les erreurs et les callbacks tardifs).

`npm run build` : compilation réussie. Avertissement Vite conservé : le paquet Three.js dépasse 500 kB avant compression. Aucun ajout de dépendance. Base GitHub Pages `/fly-operator-simulator/` et workflow conservés.

## Vérifications dans le navigateur

Une seule balise canvas et aucun ID DOM dupliqué dans la vue agrandie. Caméra générale → embarquement → fermeture : la caméra générale est restaurée. Initialisation, test à vide, ouverture de l’exploitation et restauration locale exécutés par l’interface.

Le scénario manuel 37 personnes + « Ajouter 3 » a été exécuté par les commandes du plan ; le conseil est passé de 3 à 0 après réservation. Les tests automatiques vérifient la conservation des personnes et les passages aval.

Affichage contrôlé en **1920 × 1080, 1536 × 864 et 1366 × 768**, lecteur YouTube activé : dimensions de page égales au viewport, départ et urgence dans l’écran, lecteur de 230,4 × 200 pixels. Les réglages ont leur défilement interne ; la page principale n’en a pas. Les seuils, compteurs et sièges ont été ajustés après inspection.

Captures de la version compilée :

- [Plan 1920 × 1080](plan-0.7-1920x1080.png)
- [Plan 1536 × 864](plan-0.7-1536x864.png)
- [Plan 1366 × 768](plan-0.7-1366x768.png)
- [Embarquement agrandi 1536 × 864](embarquement-0.7-1536x864.png)

La playlist fournie a réellement chargé ses pistes ; les événements du lecteur ont confirmé la lecture de l’ambiance et du morceau préshow. Une ouverture/fermeture de la vue agrandie conserve l’iframe et l’ambiance en cours. Le lecteur garde son parent DOM pour éviter un rechargement lors de ce changement de disposition. La fin de séance a également été observée ; la reprise à la seconde exacte reste validée par le test simulé, sans mesure audiovisuelle réelle.

## Références YouTube et limites

Intégration fondée sur la [référence officielle IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), les [paramètres du lecteur](https://developers.google.com/youtube/player_parameters) et les [fonctionnalités minimales requises](https://developers.google.com/youtube/terms/required-minimum-functionality). Lecteur visible d’au moins 200 × 200, contrôles natifs accessibles et commandes du jeu en dehors de la vidéo. Les options de playlist affichent les IDs réellement chargés ; aucune récupération de titres par clé API.

Le chronomètre de séance reste maître : une vidéo peut charger après le début du préshow, finir avant lui ou être refusée selon les restrictions YouTube. Les erreurs ne bloquent pas l’exploitation ; les sons locaux restent disponibles. La lecture sonore n’a pas fait l’objet d’une écoute humaine ni d’une vérification sur tous les navigateurs. Les reprises exactes de position, refus d’intégration et événements tardifs sont couverts par des lecteurs simulés.

Le rendu est une interprétation vectorielle de la maquette, pas une reproduction photoréaliste. La géométrie et les procédures sont fictives ; aucune certification d’exploitation réelle ou garantie de 60 FPS. Les réglages et caméras détaillés restent accessibles dans les dialogues, qui peuvent défiler.

## Ajustements finaux

Circuit sous le pupitre, YouTube à gauche de la caméra (vidéo de 200 px de haut), bandeau de 44 px. Intérieurs SVG locaux conservés. Préparation du quai distincte du chargement, réservation maximale de vingt personnes, complément SR, conservation et sauvegarde des identités. Le fonctionnement automatique emploie les mêmes commandes.

Les scénarios manuels existants préparent désormais le quai avant d’ouvrir les portiques ; les assertions de migration attendent le format v8. Aucun contrôle CI désactivé. La vérification ciblée sans train, double clic, complément SR et chargement progressif est réussie.

Dernière capture à 1536 × 864 : [plan avec quai préparé](plan-0.7-quai-1536x864.png). Les captures ci-dessus représentent les étapes intermédiaires.
