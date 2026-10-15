# F.L.Y. Operator Simulator — prototype 0.6

Pupitre plein écran en français : scène Three.js, circuit et carte synchronisés, deux gares souterraines, occupation des pièces, files standard/Fast Pass, préshow, 120 casiers, deux postes de sécurité et six trains. Le moteur central fournit l’état de toutes les vues.

La version **0.6** ajoute le plan vivant avec commandes de portes, les arrivées Fast Pass proportionnelles, le score persistant à la sortie, les sons synthétisés, la pause/vitesse et les raccourcis du pupitre. Vérifications et limites : [EVOLUTIONS-0.6.md](docs/EVOLUTIONS-0.6.md). Les mises à jour du site passent par les tests et le déploiement GitHub Actions.

Projet non officiel, sans affiliation à Phantasialand ou Vekoma. Tracé, altitudes, cantons, procédures et incidents sont des conventions fictives de jeu ; ce logiciel n’est pas un outil de formation à l’exploitation réelle.

## Jouer

[Ouvrir le simulateur](https://mathieugirardin-cmd.github.io/fly-operator-simulator/), sans installation sur le poste du joueur. La version en ligne correspond au dernier déploiement réussi sur [GitHub Actions](https://github.com/mathieugirardin-cmd/fly-operator-simulator/actions/workflows/deploy.yml). La procédure de mise à jour est dans [DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

Pour un développeur disposant déjà de Node.js 22 :

```powershell
npm ci
npm test
npm run dev
npm run build
```

Le jeu s’ouvre à l’adresse locale affichée par Vite. WebGL est nécessaire au rendu 3D ; les commandes et les schémas restent utilisables si le rendu ne démarre pas.

## Premier service

1. **Initialiser** avec le bouton rond en bas à gauche. La phase **Préparation** est distincte de l’ouverture visiteurs.
2. Sélectionner les trains du garage. Les demandes d’insertion attendent la libération du transfert ; une demande en attente peut être annulée.
3. Choisir **Tests à vide**. Les opérateurs virtuels préparent et font circuler les trains vides. Chaque train reçoit sa validation à son retour au débarquement. Les six trains peuvent être testés sans immobiliser la boucle.
4. Lorsque tous les trains en ligne sont validés et que les transferts sont terminés, choisir **Exploitation**. Les entrées visiteurs deviennent autorisées.
5. Pour observer le fonctionnement continu, conserver **Automatique** à la gare et l’autorisation de départ. Les visiteurs parcourent préshow → casiers → sécurité → attente d’embarquement → train → débarquement → récupération → sortie.

Un train non testé ne peut pas être ajouté à une exploitation ouverte. Fermer l’admission, revenir en Préparation puis Tests pour qualifier un train supplémentaire. Les anciennes sauvegardes sont migrées avec leur matériel considéré déjà qualifié, afin de préserver une partie en cours.

## Pupitre et vues

- Haut : phase de service, temps simulé, trains actifs, attentes et débit ; bandeau d’alertes cliquable.
- Gauche : entrées standard/Fast Pass, préshow, casiers et sécurité A assistée/B automatique.
- Centre : caméras 3D et circuit SVG, avec un plan d’occupation des pièces. Cliquer sur une pièce la sélectionne. Les points, réservations, jauges, portes et transits proviennent du moteur.
- Droite : vingt places du train, portiques, embarquement, harnais, rangées, contrôle du quai et départ.
- Bas : initialisation, Préparation/Tests/Exploitation, six positions de garage, maintien, arrêt exploitation et urgence.
- **Réglages** ouvre un tiroir pour les capacités, débits, durées, contrôles détaillés, sauvegardes et incidents existants. Le bouton **⛶** utilise le plein écran du navigateur lorsqu’il est disponible.

Les commandes bloquées donnent une raison. Le bouton Départ reste visible. Le moteur vérifie les mêmes conditions que l’interface : train positionné et qualifié, portiques fermés, retenues et rangées validées, quai libre, canton suivant disponible et aucun défaut bloquant.

## Flux et capacités

La file standard accueille 600 personnes par défaut, la file Fast Pass 160. Les capacités sont réglables jusqu’à 800 par file, dans la limite globale de 1000 personnes en préparation. Chaque file possède son ouverture, son débit, son historique et son estimation d’attente. Le ratio initial de fusion est de trois standard pour un Fast Pass ; l’ordre d’arrivée est conservé dans chaque file.

Le préshow contient au maximum 80 personnes par défaut, par groupes de 20. Capacité (1–120), taille du groupe, entrée/sortie (1–10 personnes/seconde) et durée de présentation sont réglables. À 2 personnes/seconde, engager 80 entrées demande 40 secondes, auxquelles s’ajoutent le mouvement des portes et le trajet. Une entrée engagée réserve une place ; fermer les portes laisse terminer ce passage. La présentation attend la fermeture des portes et la fin des entrées. Un groupe ne se remplit pas pendant le vidage. Fermer la sortie suspend les nouveaux transferts tout en laissant finir ceux engagés.

Chaque déplacement entre les pièces dure deux secondes de simulation et réserve une place à destination. Une destination saturée retient les visiteurs en amont. Le changement manuel/automatique conserve les identités, le groupe et les opérations déjà engagées. Les transits utilisent les pas fixes du moteur, sans minuterie d’interface indépendante.

La pièce des casiers a sa propre capacité (120 par défaut), distincte des 120 casiers et du lot de transfert maximal (20 par défaut). Six dépôts peuvent se dérouler simultanément et quarante visiteurs peuvent être préparés avec leurs affaires stockées. Le même casier reste lié à la personne jusqu’à sa récupération après le tour. La circulation sortante est suivie séparément pour permettre la récupération même lorsque l’admission est suspendue.

Après le dépôt, SEC-01 et SEC-02 traitent les visiteurs avec une durée réelle. Prendre A laisse B automatique ; quitter le contrôle rend les deux postes automatiques. Le scanner fictif permet d’inspecter, d’autoriser ou de renvoyer au même casier. Un objet interdit ne peut pas être validé par une mauvaise décision : le jeu impose un contrôle supplémentaire et comptabilise une pénalité. Ce mini-jeu existant reste simple ; aucun nouveau système complexe n’a été ajouté pour la refonte du pupitre.

## Gare, retenues et arrêts

Séquence manuelle : ouvrir les portiques → embarquer → fermer les portiques → fermer les harnais → vérifier les dix rangées → confirmer le quai libre → autoriser le départ. Les passagers déjà engagés terminent leur embarquement si les portiques sont fermés. Un départ partiellement rempli est permis.

Chaque place possède une identité et un état de retenue. Gris : vide ; orange : ouvert/à vérifier ; vert : conforme ; rouge : intervention. Rouvrir les harnais annule les validations. Les interventions existantes sont accessibles dans le tiroir. Les vérifications virtuelles sont progressives et ne contournent pas un défaut.

Le débarquement est progressif. Les visiteurs rejoignent ensuite leurs affaires puis la sortie. Un retrait demandé attend le train vide ; le transfert vers le garage est animé pendant trois secondes et garde la section occupée jusqu’à son terme.

**Arrêt exploitation** bloque les nouveaux départs ; les trains déjà engagés finissent leur circulation autorisée. **Arrêt d’urgence** fige les déplacements et traitements du simulateur. Acquitter ne répare aucun défaut. Après acquittement et réarmement, l’autorisation de départ doit être réactivée manuellement.

## Sauvegardes

IndexedDB conserve la partie dans le navigateur : sauvegarde manuelle et automatique toutes les trente secondes après initialisation. Les réglages, identités, casiers, inspections, réservations de destinations, trains et transferts sont enregistrés. Les versions précédentes sont validées puis migrées avant remplacement de l’état vivant. Une sauvegarde incohérente ne détruit pas la partie courante.

Les sauvegardes sont propres au navigateur et à l’origine du site. Elles ne se synchronisent pas entre ordinateurs ; une sauvegarde de localhost n’apparaît pas automatiquement sur GitHub Pages. Un onglet masqué suspend le temps et déclenche une sauvegarde ; il n’y a pas de progression hors ligne.

## Scènes et repère

Les références fournies se trouvent dans `docs/references`. X/Z correspondent à la projection du plan aérien ; Y est l’altitude. `src/config/track.js` définit `WORLD_LEVELS` : extérieur à 0 m, rails des gares à −7 m, quais à −10,6 m, plafonds à −2 m, retour à −16 m et points hauts à +29 m. Ces altitudes sont configurables dans le code et restent des hypothèses.

L’embarquement occupe le trait cyan vertical de droite, le débarquement le trait horizontal supérieur. Cette interprétation des annotations pourra être ajustée avec de meilleures références. Les deux gares possèdent murs, plafonds, portails, quais et éclairage artificiel. Les photos guident les matériaux industriels. Le préshow, le garage, la salle de sécurité et les raccords intermédiaires sont des implantations fictives.

Les couleurs du plan ne définissent pas les cantons. La carte distingue la légende du document et l’occupation logique. Les croisements, gabarits, dynamiques et procédures ne sont pas une étude d’ingénierie de l’attraction réelle.

## Architecture et validation

`SimulationEngine` est indépendant du DOM et de Three.js. `CommandDispatcher` contrôle les actions ; `ServiceSystem`, `FlowSystem`, `LockerSystem`, `StationSystem` et `TrainSystem` assurent les transitions. Les vues lisent l’état central. Le moteur avance par pas fixes de 100 ms.

Les tests couvrent la conservation des personnes, les cantons, les gares souterraines, les sauvegardes et migrations, les deux files, le préshow, les casiers, la sécurité, les retenues et la maintenance déjà présente. Les scénarios du pupitre vérifient le cycle de test des six trains, les réservations, la saturation aval, la fermeture pendant un passage et le transfert garage.

La vérification finale et ses captures sont consignées dans [VALIDATION.md](docs/VALIDATION.md). Les performances dépendent de la machine ; aucune garantie de 60 FPS n’est établie. Le catalogue de nouveaux incidents complexes et la refonte des statistiques sont reportés conformément au dernier périmètre demandé. Le module d’incidents existant reste accessible dans les réglages.
