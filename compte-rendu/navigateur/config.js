/*
 * CONFIGURATION DE DÉPLOIEMENT — à régler par l'administrateur (DSI / RSSI), pas par les utilisateurs.
 * Les utilisateurs ne peuvent pas assouplir ces règles depuis l'application.
 */
window.CR_CONFIG = Object.freeze({
  /*
   * Conservation des données sur le poste :
   *  - "ephemere" (par défaut, recommandé) : tout est effacé à la fermeture du navigateur ;
   *    rien ne subsiste d'une session à l'autre ;
   *  - "duree" : conservation sur le poste, avec purge automatique selon les durées des réglages.
   */
  conservation: "ephemere",

  /*
   * Source des modèles de transcription :
   *  - "local" : modèles hébergés avec l'application, dans le dossier « modeles/ »
   *    (aucune connexion externe ; voir outils/telecharger-modeles.py) ;
   *  - "huggingface" : téléchargement depuis huggingface.co au premier usage
   *    (aucune donnée de réunion n'y est envoyée, mais l'adresse IP du poste est visible).
   */
  sourceModeles: "huggingface",

  /*
   * Fournisseurs d'IA optionnels autorisés pour l'analyse approfondie (seul le TEXTE leur est envoyé).
   *  - "mistral" : Mistral AI (France / UE) ;
   *  - "ollama"  : modèle installé sur le poste (aucun envoi) ;
   *  - "claude"  : Anthropic (États-Unis, HORS UE) — désactivé par défaut ; à n'ajouter
   *                qu'après accord du DPO (transfert hors UE).
   * Liste vide [] : aucune IA externe, l'application fonctionne uniquement avec l'analyse locale.
   */
  iaAutorisees: ["mistral", "ollama"],

  /* Mémorisation des clés d'API sur le poste (sinon : effacées à la fermeture du navigateur). */
  memoriserClesAutorise: false,
});
