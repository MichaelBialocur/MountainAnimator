# Mountain Animator

Application web qui construit automatiquement des **découpes 3D photoréalistes de montagnes**, côte à côte et à la même échelle. L'objectif est de produire directement dans le navigateur le type de composition qui demanderait autrement plusieurs heures dans Blender.

## Version actuelle

- une seule scène Three.js, et non plusieurs cartes séparées ;
- véritables volumes découpés avec surface topographique, contour organique, faces latérales et base ;
- données d'altitude réelles provenant des Mapzen Terrain Tiles hébergées par AWS ;
- photographie satellite/aérienne Esri World Imagery appliquée au relief ;
- trois niveaux de détail (Équilibré, Haute qualité et Ultra) jusqu'à 256 × 256 sommets par bloc et des textures 2 048 px ;
- diamètre et décentrage Est/Ouest et Nord/Sud réglables séparément pour chaque bloc ;
- luminosité, direction, hauteur et intensité du soleil réglables, avec ombres activables ;
- nuages animés dont la densité, le détail, l'opacité et la taille sont réglables ;
- jusqu'à trois sommets réellement posés côte à côte ;
- Grand Chavalard et Lagginhorn sélectionnés par défaut ;
- ajout de n'importe quel sommet par latitude, longitude et altitude ;
- import GPX avec placement automatique sur la bonne découpe, lecture progressive et suivi par la caméra ;
- panneaux statistiques intégrés à la scène 3D : altitude, distance, dénivelé, durée et commentaire ;
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

## Confidentialité

Les GPX sont lus localement par le navigateur et ne sont pas téléversés par l'application. Les statistiques personnelles restent dans le stockage local de l'appareil.

## Performances

Le mode **Haute qualité** est le réglage conseillé sur ordinateur récent. Le mode **Équilibré** limite la mémoire GPU sur téléphone. Le mode **Ultra** charge davantage de relief et de texture et peut demander plusieurs secondes par montagne ; l'application affiche un avertissement avant son activation sur mobile.
