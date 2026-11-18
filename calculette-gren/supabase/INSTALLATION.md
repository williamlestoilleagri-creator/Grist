# Mettre en service le backoffice de la Calculette GREN

L'application publique fonctionne sans serveur : les données des agriculteurs restent dans leur navigateur.
Le **backoffice** (`/calculette-gren/admin/`) a besoin d'une base de données sécurisée pour :

- authentifier les administrateurs (mot de passe + **double authentification obligatoire**) ;
- enregistrer les connexions, les tentatives d'attaque et les blocages d'adresses IP ;
- mesurer l'utilisation de l'application de façon anonyme ;
- publier le **référentiel GREN officiel**, chargé automatiquement par l'application ;
- afficher un bandeau d'information ou mettre l'application en maintenance.

Le service retenu est **Supabase** (PostgreSQL hébergé, offre gratuite suffisante). Comptez 20 minutes.

---

## 1. Créer le projet Supabase

1. Créez un compte sur <https://supabase.com> puis **New project**.
2. Nom : `calculette-gren`. Région : **Europe — Paris (eu-west-3)** ou Francfort.
3. Choisissez un mot de passe de base de données robuste et conservez-le dans un coffre-fort de mots de passe.

## 2. Créer les tables et les règles de sécurité

1. Ouvrez le fichier [`schema.sql`](schema.sql) et, **tout en bas**, remplacez `votre.adresse@exemple.fr` par **votre** adresse électronique : vous serez le premier super-administrateur.
2. Dans Supabase : **SQL Editor → New query**, collez tout le contenu du fichier, puis **Run**.
3. Vérifiez dans **Table Editor** que les tables `admins`, `connexions`, `securite`, `referentiels`… existent et que `admins` contient votre adresse.

Le script est ré-exécutable : vous pouvez le relancer après une mise à jour.

## 3. Régler l'authentification

Dans **Authentication** :

| Réglage | Où | Valeur |
|---|---|---|
| Adresse du site | URL Configuration → *Site URL* | `https://williamlestoilleagri-creator.github.io/Grist/calculette-gren/admin/` |
| Adresses de retour autorisées | URL Configuration → *Redirect URLs* | la même adresse |
| Fournisseur e-mail | Sign In / Providers → Email | activé, *Confirm email* activé |
| Inscriptions | Sign In / Providers → *Allow new users to sign up* | **activé** (seules les adresses ajoutées dans le backoffice peuvent réellement créer un compte : la base refuse toutes les autres) |
| Double authentification | Multi-Factor → TOTP | activé (c'est le réglage par défaut) |
| Mot de passe | Sign In / Providers → Email → Password requirements | 12 caractères minimum, minuscules, majuscules, chiffres et symboles |

**Envoi des courriels** : le service d'envoi intégré de Supabase n'écrit qu'aux membres de l'équipe du projet et est limité à quelques messages par heure. Pour inviter d'autres administrateurs, configurez un serveur SMTP dans **Project Settings → Authentication → SMTP Settings** (par exemple la messagerie de votre service, ou un prestataire comme Brevo).

## 4. Relier l'application au projet

1. Dans **Project Settings → API** (ou *Data API*), copiez :
   - **Project URL** (`https://xxxx.supabase.co`) ;
   - la clé **anon / publishable** (clé publique, prévue pour être dans une page web).
2. Renseignez-les dans [`../config.js`](../config.js) :

   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```

3. Enregistrez, poussez sur GitHub et fusionnez dans `main` : GitHub Pages republie le site en une ou deux minutes.

> ⚠ Ne mettez **jamais** la clé `service_role` (ou *secret*) dans `config.js` : elle contourne toutes les règles de sécurité.

## 5. Première connexion

1. Ouvrez `https://williamlestoilleagri-creator.github.io/Grist/calculette-gren/admin/`.
2. Cliquez sur **Première connexion / j'ai reçu une invitation** et saisissez votre adresse.
3. Ouvrez le lien reçu par courriel, puis :
   1. définissez votre mot de passe ;
   2. scannez le QR code avec une application d'authentification (FreeOTP, Aegis, Google Authenticator, Microsoft Authenticator…) et saisissez le code à 6 chiffres.
4. Vous arrivez sur le tableau de bord. Les connexions suivantes demandent : adresse, mot de passe, puis code à 6 chiffres.

## 6. Créer d'autres accès administrateur

**Administrateurs → Créer un accès** : adresse, nom et rôle.

| Rôle | Droits |
|---|---|
| Super-administrateur | tout, y compris la gestion des accès et la purge des journaux |
| Administrateur | référentiel, paramètres, traitement des alertes, blocage d'IP |
| Lecteur | consultation seule |

La personne reçoit une invitation et suit les mêmes étapes que vous. Un accès **désactivé** ou **supprimé** perd immédiatement l'accès aux données, même si la personne est encore connectée.

## 7. Publier le référentiel GREN officiel

**Référentiel GREN → Nouveau brouillon** (à partir des valeurs par défaut), corrigez les valeurs d'après l'arrêté en vigueur, puis **Publier**. Toutes les instances de l'application le chargent à leur ouverture suivante, sauf celles dont l'utilisateur a volontairement personnalisé le référentiel.

---

## Sécurité : ce qui est en place

- **Droits vérifiés par la base de données** (Row Level Security) : même avec la clé publique, personne ne peut lire ni modifier une table sans être administrateur actif **et** authentifié en double facteur.
- **Création de compte verrouillée** : la base refuse toute inscription d'une adresse absente de la liste des administrateurs.
- **Anti-force brute** : blocage temporaire d'une adresse IP après 5 échecs en 15 minutes, blocage automatique après 20 échecs en une heure (réglable dans *Paramètres*).
- **Détection** : robots (champ piège invisible), attaques réparties sur plusieurs IP contre un même compte, échecs de double authentification, connexions de comptes non administrateurs, excès de requêtes.
- **Journal d'administration** tenu par la base elle-même : toute modification des accès, du référentiel, des paramètres ou des blocages est tracée, avec l'auteur.
- **Journal d'authentification Supabase** consultable dans *Connexions* : il fait foi même si quelqu'un tente de contourner la page de connexion.
- Déconnexion automatique après 30 minutes d'inactivité, page non indexée, politique de sécurité du contenu (CSP) interdisant les scripts tiers, protection contre l'affichage dans un cadre.
- Mesure d'audience **anonyme** : aucune IP, aucun nom, aucun PACAGE. Les IP ne sont conservées que pour la sécurité du backoffice (durée réglable, 1 an par défaut).

## Limites à connaître

- GitHub Pages et Supabase filtrent les attaques réseau de masse (déni de service) ; le backoffice ne les voit pas.
- Pour un service officiel en production, faites valider l'hébergement par la DSI / le RSSI de votre administration (analyse de risques, RGPD, éventuel hébergement souverain) et ajoutez le service au registre des traitements.
- Le Système de Design de l'État, la police Marianne et le bloc-marque sont **réservés aux sites de l'État** : leur usage suppose que le service soit édité pour le compte de la préfecture.
