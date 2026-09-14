# Mountain Animator

Application web qui construit automatiquement des **découpes 3D photoréalistes de montagnes**, côte à côte et à la même échelle. L'objectif est de produire directement dans le navigateur le type de composition qui demanderait autrement plusieurs heures dans Blender.

## Version 4

- une seule scène Three.js, et non plusieurs cartes séparées ;
- véritables volumes découpés avec surface topographique, contour organique, faces latérales et base ;
- données d'altitude réelles provenant des Mapzen Terrain Tiles hébergées par AWS ;
- photographie satellite/aérienne Esri World Imagery appliquée au relief ;
- trois niveaux de détail (Équilibré, Haute qualité et Ultra) jusqu'à 256 × 256 sommets par bloc et des textures 2 048 px ;
- diamètre, décentrage Est/Ouest–Nord/Sud et rotation réglables séparément pour chaque bloc ;
- cinq sols : marbre blanc veiné (par défaut), marbre noir, ardoise, bois et studio mat ;
- luminosité, direction, hauteur et intensité du soleil réglables, avec ombres activables ;
- nuages animés avec une silhouette propre à chaque groupe, réglage de densité, détail, opacité et taille, et bouton pour renouveler leur répartition ;
- jusqu'à trois sommets réellement posés côte à côte ;
- Grand Chavalard et Lagginhorn sélectionnés par défaut ;
- ajout de n'importe quel sommet par latitude, longitude et altitude ;
- import GPX avec placement sur le relief, couleur par montagne et animation proportionnelle aux distances ;
- caméra stabilisée, approche progressive depuis la vue actuelle et recul final pour cadrer tout le tracé visible ;
- fiches d'ascension intégrées à la scène : papier, courbes de niveau et teintes alpines, sans titre ni nom répété ;
- fenêtre d'ajout fermable par Annuler, Échap ou clic extérieur, même avec une saisie vide ;
- caméra orbitale, rotation automatique et mode film plein écran ;
- interface responsive pour ordinateur et téléphone.

## Lancer localement

Le projet est statique, sans compilation :

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000`. Il ne faut pas ouvrir directement `index.html` avec une URL `file://` ou `content://`, car les navigateurs mobiles bloquent alors certains téléchargements nécessaires.

## Sources et connexion

Une connexion Internet est nécessaire au premier affichage d'une montagne :

- moteur 3D : Three.js via jsDelivr ;
- altitude : Mapzen Terrain Tiles, jeu de données public hébergé sur AWS ;
- texture : Esri World Imagery.

Les tuiles déjà téléchargées restent en cache navigateur selon les règles des fournisseurs. Aucun jeton API n'est nécessaire.

Les matériaux du sol et les silhouettes des nuages sont générés localement. Les nuages utilisent des sprites répartis dans l'espace, sans simulation volumétrique physique. La qualité du relief reste limitée par les données d'altitude disponibles dans la région ; le niveau Ultra ne crée pas de détails géographiques absents de la source.

## Composer une animation

1. Dans **Bloc individuel**, sélectionner une montagne, régler son diamètre, son décentrage et sa rotation. Le tracé et les repères tournent avec le terrain.
2. Dans **Parcours GPX**, importer le fichier et choisir une couleur pour le sommet actif. Le tracé entier apparaît d'abord pour permettre de préparer le cadrage.
3. Choisir la montagne à suivre et placer la caméra à l'angle souhaité. Cliquer sur **Animer** : une approche de 2,4 s précède la lecture, puis un recul de 3 s cadre l'ensemble du tracé à la fin.
4. La durée choisie correspond au parcours, hors transitions. Un segment dix fois plus long reçoit dix fois plus de temps. La caméra garde le cap choisi au départ et filtre les petits changements de position pour ne pas tourner dans chaque lacet. **Caméra suiveuse** peut être désactivée pour garder une caméra libre.
5. Pause, reprise et déplacement du curseur restent possibles. **Vue d'ensemble du GPX** montre immédiatement la trace complète et lance un recul progressif.

Les ruptures entre segments GPX ne sont pas reliées par une ligne inventée. Les parties hors des découpes ne sont pas affichées ; une longue liaison enregistrée dans un même segment est interpolée et plaquée sur le relief. Les statistiques des fiches concernent la portion visible de chaque bloc, tandis que le récapitulatif d'import concerne le GPX complet. Les valeurs saisies manuellement prennent priorité dans les fiches.

## Vérifier le code

L'application reste statique et ne nécessite pas npm pour être utilisée. Les dépendances de développement servent seulement aux tests :

```bash
npm ci
npm run check
npm test
```

Les tests vérifient le dialogue, la progression par distance, les segments séparés, les transformations 3D, les couleurs, les transitions de caméra et la compatibilité des réglages sauvegardés. Le moteur et les géométries Three.js sont réels dans les tests ; seuls le dessin WebGL et les téléchargements sont remplacés. Le rendu GPU doit donc aussi être vérifié dans un navigateur compatible.

## Confidentialité

Les GPX sont lus localement par le navigateur et ne sont pas téléversés par l'application. Les statistiques personnelles restent dans le stockage local de l'appareil.

## Performances

Le mode **Haute qualité** est le réglage conseillé sur ordinateur récent. Le mode **Équilibré** limite la mémoire GPU sur téléphone. Le mode **Ultra** charge davantage de relief et de texture et peut demander plusieurs secondes par montagne.


## V5 — historique (export remplacé par la V6)

- Export local MediaRecorder : 1920×1080 / 3840×2160, ou 1080×1920 / 2160×3840 ; MP4 et WebM proposés uniquement si le navigateur les annonce compatibles. 30 fps visées, encodage en temps réel (pas de rendu image par image hors ligne). Le GPU et l’encodeur peuvent limiter la fluidité, surtout en 4K. Aucun audio.
- Choisir les paramètres dans Export vidéo, enregistrer puis utiliser Animer/Rotation, ou enregistrer une animation déjà en cours. Arrêt manuel, durée maximale, annulation, lien de téléchargement persistant. Une page masquée termine la capture. Les transitions GPX sont incluses lorsqu’elles ont lieu pendant l’enregistrement.
- Nuages procéduraux volumétriques par intégration de densité, bruit multi-échelle et atténuation lumineuse : cumulus, stratus, cirrus stylisés. Les volumes complets et leur dérive sont maintenus au-dessus du relief sous-jacent, y compris les blocs voisins pivotés. Ce sont des approximations temps réel, pas une simulation météorologique ni une garantie de photoréalisme.
- Neige par sommet : activation et seuil 0–6000 m (altitude réelle, indépendante de l’exagération). Transition douce et moindre couverture des fortes pentes. La couche ajoute une apparence de neige, sans épaisseur géométrique et sans effacer la neige déjà présente sur les photos satellite.
- Panneaux par sommet : position X/Y/Z relative à leur position initiale, réinitialisation, sauvegarde compatible V3/V4 ; occultation par profondeur. Noms des sommets occultés par raycasting et inclus dans la vidéo.
- Vérification : tests Node/jsdom sur logique, sauvegarde, géométrie et cycle d’enregistrement simulé. Validation GPU et véritable encodage 4K à effectuer dans un navigateur compatible.


## V6 — rendu hors temps réel

L’export V5 MediaRecorder est remplacé par un calcul déterministe image par image.
Le rendu avance de 1/30 ou 1/60 seconde par image, sans utiliser le temps réel.
Chaque image reçoit un timestamp explicite WebCodecs ; la boucle attend l’encodeur
et vérifie le nombre d’images produites avant de livrer le fichier. Le temps de
calcul peut dépasser largement la durée du film sans pertes d’images dans le fichier.

- 1080p/4K, paysage/vertical, 30/60 i/s, MP4 H.264 ou WebM VP9/VP8. Compatibilité de
  l’encodeur vérifiée pour les dimensions et la cadence demandées. Aucun repli en
  capture d’écran en cas d’incompatibilité.
- Séquences : tour complet, GPX complet (approche et recul inclus, durée calculée),
  animation actuelle ou caméra fixe. La vue et l’état de lecture sont restaurés à
  la fin ou après annulation. Les commandes d’édition sont bloquées pendant le rendu.
- Calcul local : garder la page ouverte. Un onglet en arrière-plan peut ralentir le
  calcul ; la fermeture de la page interrompt le travail. Le fichier est assemblé
  en mémoire avec un garde-fou de 512 Mo de données encodées, sans sauvegarde de reprise.
- Nuages : altitude de référence, dispersion verticale et mélange à poids réglables.
  Stratus : −350 m, cirrus : +1400 m par rapport à la référence. La protection du
  relief peut relever les nuages au-dessus de l’altitude demandée.
- Neige : bruit non périodique à plusieurs échelles, plaques, affleurements et
  couverture réglable par sommet. Pente physique indépendante de l’exagération,
  variation de teinte et de rugosité. Il s’agit d’un matériau, pas d’un manteau simulé.
- Ombres : lumière ambiante réglable (0,55 par défaut), éclairage secondaire réduit,
  carte d’ombre ajustée à la composition et biais réduit pour les auto-ombres.

Vérifications : tests Node/jsdom, films de contrôle MP4/WebM décodés par FFmpeg
(30 images, 30 i/s, 1 seconde). Le diagnostic `tests/export-smoke.html` permet un
véritable encodage WebCodecs sur canvas 2D sans dépendre de WebGL. Le rendu GPU de
la neige et des ombres nécessite un navigateur avec accélération graphique.
