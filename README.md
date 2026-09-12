# Mountain Animator

Comparateur 3D de sommets alpins, conçu pour ordinateur et mobile. Il affiche plusieurs montagnes côte à côte avec relief réel, caméra synchronisée, rotation cinématique, import GPX et statistiques personnelles.

## Utilisation

Le site est statique et ne nécessite aucune compilation. Ouvrez `index.html` via un serveur HTTP, ou activez GitHub Pages sur la branche `main` (`Settings → Pages → Deploy from a branch`).

Pour tester localement :

```bash
python3 -m http.server 8000
```

Puis ouvrez `http://localhost:8000`.

## Données externes

L'application charge CesiumJS depuis jsDelivr, les tuiles OpenStreetMap et le relief WorldElevation3D d'Esri. Une connexion Internet est donc nécessaire. Si le relief Esri ne répond pas, l'application garde une scène visible en mode de secours au lieu d'un écran noir.

## Confidentialité

Les statistiques saisies restent dans le stockage local du navigateur. Les fichiers GPX sont analysés localement et ne sont envoyés à aucun serveur par l'application.
