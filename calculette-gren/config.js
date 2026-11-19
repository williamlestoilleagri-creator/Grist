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
  INACTIVITE_MINUTES: 30
  // Les comptes de l'espace administrateur ne sont plus ici : ils sont dans comptes-admin.json,
  // géré depuis l'application (Administration → Comptes), sans rien écrire dans le code.
};
