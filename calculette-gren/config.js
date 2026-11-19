/* Calculette GREN — configuration du serveur (Supabase).
   1. Créez un projet sur https://supabase.com (région Europe — Paris ou Francfort).
   2. Exécutez supabase/schema.sql dans « SQL Editor ».
   3. Copiez ici « Project URL » et la clé publique « anon / publishable »
      (Project Settings → API). Ne mettez JAMAIS la clé « service_role » ici.
   Laissés vides, l'application fonctionne sans serveur (données locales uniquement,
   pas de statistiques ni de référentiel publié) et le backoffice reste fermé. */
window.GREN_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  // Bloc-marque DSFR (lignes du logo)
  MARQUE: ["Préfète", "de la région", "Bretagne"],
  // Lien des pages obligatoires du pied de page (à compléter par le service)
  CONTACT: "",
  // Déconnexion automatique du backoffice après inactivité (minutes)
  INACTIVITE_MINUTES: 30,
  // Comptes de l'espace administrateur de l'application (bouton « Espace administrateur »).
  // Pour ajouter un compte : se connecter, Administration → « Créer un compte », puis coller ici
  // la ligne proposée. Le mot de passe n'apparaît jamais : seulement son empreinte chiffrée (PBKDF2).
  // Compte de départ : identifiant « admin » (mot de passe communiqué séparément) — à remplacer dès que possible.
  COMPTES_ADMIN: [
    {"identifiant": "admin", "nom": "Administrateur (compte de départ)", "role": "superadmin", "iterations": 210000, "sel": "dd7898d0cf7a09eec8987b04557f8bf7", "empreinte": "ec49737da872881c240a73c149df7c22936e7e8adea4752ddfc4b969f2e54885"},
  ]
};
