-- =============================================================================
--  Calculette GREN — schéma de la base Supabase (backoffice, statistiques,
--  sécurité, référentiel publié).
--
--  À exécuter UNE FOIS dans Supabase → SQL Editor, après avoir remplacé
--  l'adresse e-mail du premier super-administrateur tout en bas du fichier.
--  Le script est ré-exécutable (create or replace / if not exists).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. TABLES
-- -----------------------------------------------------------------------------

-- Liste d'autorisation des administrateurs. Seules ces adresses peuvent créer
-- un compte (voir trigger sur auth.users).
create table if not exists public.admins (
  email               text primary key check (email = lower(email) and position('@' in email) > 1),
  user_id             uuid unique,
  nom                 text,
  role                text not null default 'admin' check (role in ('superadmin','admin','lecteur')),
  actif               boolean not null default true,
  mdp_defini          boolean not null default false,
  cree_le             timestamptz not null default now(),
  cree_par            text,
  derniere_connexion  timestamptz
);

-- Paramètres globaux (une seule ligne).
create table if not exists public.parametres (
  id                     int primary key default 1 check (id = 1),
  annonce                text not null default '',
  annonce_niveau         text not null default 'info' check (annonce_niveau in ('info','warning','error','success')),
  maintenance            boolean not null default false,
  maintenance_message    text not null default 'La Calculette GREN est en maintenance. Merci de réessayer plus tard.',
  max_tentatives         int not null default 5  check (max_tentatives between 3 and 50),
  fenetre_minutes        int not null default 15 check (fenetre_minutes between 1 and 1440),
  blocage_ip_seuil       int not null default 20 check (blocage_ip_seuil between 5 and 500),
  blocage_ip_heures      int not null default 24 check (blocage_ip_heures between 1 and 8760),
  max_requetes_minute    int not null default 120 check (max_requetes_minute between 10 and 10000),
  retention_jours        int not null default 365 check (retention_jours between 30 and 3650),
  modifie_le             timestamptz not null default now(),
  modifie_par            text
);
insert into public.parametres (id) values (1) on conflict do nothing;

-- Versions du référentiel GREN. Une seule version « publie » à la fois :
-- c'est elle que l'application charge.
create table if not exists public.referentiels (
  id           bigint generated always as identity primary key,
  version      int not null,
  contenu      jsonb not null,
  commentaire  text,
  statut       text not null default 'brouillon' check (statut in ('brouillon','publie','archive')),
  cree_le      timestamptz not null default now(),
  cree_par     text,
  publie_le    timestamptz,
  publie_par   text
);
create unique index if not exists referentiels_un_seul_publie on public.referentiels (statut) where statut = 'publie';

-- Mesure d'audience anonyme de l'application (aucune adresse IP, aucune donnée
-- d'exploitation : seulement le type d'action, le département et la culture).
create table if not exists public.evenements (
  id           bigint generated always as identity primary key,
  le           timestamptz not null default now(),
  type         text not null,
  session      text,
  departement  text,
  culture      text,
  appareil     text
);
create index if not exists evenements_le on public.evenements (le);

-- Connexions au backoffice (réussies et échouées).
create table if not exists public.connexions (
  id          bigint generated always as identity primary key,
  le          timestamptz not null default now(),
  email       text,
  user_id     uuid,
  succes      boolean not null,
  motif       text not null,
  ip          text,
  user_agent  text
);
create index if not exists connexions_le on public.connexions (le);
create index if not exists connexions_ip_le on public.connexions (ip, le);

-- Événements de sécurité (attaques, tentatives suspectes).
create table if not exists public.securite (
  id          bigint generated always as identity primary key,
  le          timestamptz not null default now(),
  type        text not null,
  gravite     text not null default 'moyenne' check (gravite in ('info','faible','moyenne','haute','critique')),
  ip          text,
  email       text,
  details     jsonb not null default '{}'::jsonb,
  traite      boolean not null default false,
  traite_par  text,
  traite_le   timestamptz
);
create index if not exists securite_le on public.securite (le);

-- Adresses IP bloquées (manuellement ou automatiquement).
create table if not exists public.ip_bloquees (
  ip        text primary key,
  motif     text,
  jusqu_a   timestamptz,           -- null = définitif
  auto      boolean not null default false,
  cree_le   timestamptz not null default now(),
  cree_par  text
);

-- Compteurs anti-flood (clé = empreinte de l'IP, jamais l'IP en clair).
create table if not exists public.debits (
  cle     text not null,
  minute  timestamptz not null,
  n       int not null default 0,
  primary key (cle, minute)
);

-- Journal des actions d'administration.
create table if not exists public.journal_admin (
  id       bigint generated always as identity primary key,
  le       timestamptz not null default now(),
  acteur   text,
  action   text not null,
  cible    text,
  details  jsonb
);
create index if not exists journal_admin_le on public.journal_admin (le);

-- -----------------------------------------------------------------------------
-- 2. FONCTIONS UTILITAIRES
-- -----------------------------------------------------------------------------

create or replace function public.entetes() returns json
language sql stable as $$
  select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json
$$;

create or replace function public.client_ip() returns text
language sql stable as $$
  select left(coalesce(
    nullif(public.entetes()->>'cf-connecting-ip', ''),
    nullif(public.entetes()->>'x-real-ip', ''),
    nullif(trim(split_part(public.entetes()->>'x-forwarded-for', ',', 1)), ''),
    'inconnue'), 64)
$$;

create or replace function public.client_ua() returns text
language sql stable as $$
  select left(coalesce(public.entetes()->>'user-agent', ''), 300)
$$;

create or replace function public.email_jwt() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt()->>'email', ''))
$$;

-- Rôle de l'administrateur connecté. Exige un compte actif ET une
-- authentification à deux facteurs validée (aal2).
create or replace function public.admin_role() returns text
language sql stable security definer set search_path = public as $$
  select a.role from public.admins a
  where a.user_id = auth.uid() and a.actif
    and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
$$;
-- coalesce : une valeur NULL ne doit jamais être interprétée comme « autorisé ».
create or replace function public.is_admin()      returns boolean language sql stable as $$ select coalesce(public.admin_role() is not null, false) $$;
create or replace function public.can_write()     returns boolean language sql stable as $$ select coalesce(public.admin_role() in ('superadmin','admin'), false) $$;
create or replace function public.is_superadmin() returns boolean language sql stable as $$ select coalesce(public.admin_role() = 'superadmin', false) $$;

create or replace function public.ip_est_bloquee(p_ip text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ip_bloquees where ip = p_ip and (jusqu_a is null or jusqu_a > now()))
$$;

create or replace function public.signaler(p_type text, p_gravite text, p_ip text, p_email text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.securite (type, gravite, ip, email, details) values (p_type, p_gravite, p_ip, lower(p_email), coalesce(p_details, '{}'::jsonb))
$$;

-- Limiteur de débit par IP (empreinte). Retourne false au-delà du seuil.
create or replace function public.limiter_debit(p_portee text, p_ip text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cle text := encode(extensions.digest(p_portee || ':' || p_ip || ':' || to_char(now(), 'YYYY-MM-DD'), 'sha256'), 'hex');
  v_min timestamptz := date_trunc('minute', now());
  v_n int; v_max int;
begin
  select max_requetes_minute into v_max from public.parametres where id = 1;
  insert into public.debits (cle, minute, n) values (v_cle, v_min, 1)
    on conflict (cle, minute) do update set n = public.debits.n + 1
    returning n into v_n;
  if v_n = v_max + 1 then
    perform public.signaler('flood', 'moyenne', p_ip, null, jsonb_build_object('portee', p_portee, 'requetes_minute', v_n));
  end if;
  return v_n <= v_max;
end $$;

-- -----------------------------------------------------------------------------
-- 3. INSCRIPTION RÉSERVÉE AUX ADRESSES AUTORISÉES
-- -----------------------------------------------------------------------------

create or replace function public.verifier_inscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where email = lower(new.email) and actif) then
    raise exception 'Inscription non autorisée pour cette adresse';
  end if;
  return new;
end $$;

create or replace function public.lier_compte_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.admins set user_id = new.id where email = lower(new.email);
  return new;
end $$;

drop trigger if exists gren_verifier_inscription on auth.users;
create trigger gren_verifier_inscription before insert on auth.users
  for each row execute function public.verifier_inscription();
drop trigger if exists gren_lier_compte_admin on auth.users;
create trigger gren_lier_compte_admin after insert on auth.users
  for each row execute function public.lier_compte_admin();

-- -----------------------------------------------------------------------------
-- 4. PARCOURS DE CONNEXION (appelés par la page du backoffice)
-- -----------------------------------------------------------------------------

-- Avant la saisie du mot de passe : IP bloquée ? trop d'échecs ? robot ?
create or replace function public.avant_connexion(p_email text, p_piege text default '')
returns json language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.client_ip(); v_p public.parametres; v_echecs int; v_email text := lower(left(coalesce(p_email,''), 200));
begin
  select * into v_p from public.parametres where id = 1;
  if not public.limiter_debit('connexion', v_ip) then
    return json_build_object('autorise', false, 'message', 'Trop de requêtes. Réessayez dans une minute.');
  end if;
  if coalesce(p_piege, '') <> '' then
    perform public.signaler('robot', 'haute', v_ip, v_email, jsonb_build_object('champ_piege', left(p_piege, 100), 'ua', public.client_ua()));
    insert into public.connexions (email, succes, motif, ip, user_agent) values (v_email, false, 'robot', v_ip, public.client_ua());
    return json_build_object('autorise', false, 'message', 'Connexion impossible.');
  end if;
  if public.ip_est_bloquee(v_ip) then
    perform public.signaler('tentative_ip_bloquee', 'haute', v_ip, v_email, jsonb_build_object('ua', public.client_ua()));
    insert into public.connexions (email, succes, motif, ip, user_agent) values (v_email, false, 'ip_bloquee', v_ip, public.client_ua());
    return json_build_object('autorise', false, 'message', 'Accès refusé depuis cette adresse réseau.');
  end if;
  select count(*) into v_echecs from public.connexions
   where ip = v_ip and not succes and motif in ('mot_de_passe','mfa') and le > now() - make_interval(mins => v_p.fenetre_minutes);
  if v_echecs >= v_p.max_tentatives then
    insert into public.connexions (email, succes, motif, ip, user_agent) values (v_email, false, 'verrouille', v_ip, public.client_ua());
    return json_build_object('autorise', false, 'message',
      format('Trop de tentatives échouées. Réessayez dans %s minutes.', v_p.fenetre_minutes));
  end if;
  return json_build_object('autorise', true);
end $$;

-- Après un échec (mot de passe ou code à deux facteurs).
create or replace function public.echec_connexion(p_email text, p_motif text default 'mot_de_passe')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.client_ip(); v_p public.parametres; v_n_ip int; v_n_email int; v_n_heure int;
  v_email text := lower(left(coalesce(p_email,''), 200));
  v_motif text := case when p_motif in ('mot_de_passe','mfa','non_autorise','inscription_refusee') then p_motif else 'mot_de_passe' end;
begin
  if not public.limiter_debit('connexion', v_ip) then return; end if;
  select * into v_p from public.parametres where id = 1;
  insert into public.connexions (email, succes, motif, ip, user_agent) values (v_email, false, v_motif, v_ip, public.client_ua());

  if v_motif = 'inscription_refusee' then
    perform public.signaler('inscription_refusee', 'moyenne', v_ip, v_email, '{}'::jsonb);
    return;
  end if;

  select count(*) into v_n_ip from public.connexions
   where ip = v_ip and not succes and motif in ('mot_de_passe','mfa') and le > now() - make_interval(mins => v_p.fenetre_minutes);
  if v_n_ip = v_p.max_tentatives then
    perform public.signaler('force_brute', 'haute', v_ip, v_email,
      jsonb_build_object('echecs', v_n_ip, 'fenetre_minutes', v_p.fenetre_minutes, 'ua', public.client_ua()));
  end if;

  -- Blocage automatique de l'IP au-delà du seuil horaire
  select count(*) into v_n_heure from public.connexions
   where ip = v_ip and not succes and le > now() - interval '1 hour';
  if v_n_heure >= v_p.blocage_ip_seuil and not public.ip_est_bloquee(v_ip) then
    insert into public.ip_bloquees (ip, motif, jusqu_a, auto, cree_par)
      values (v_ip, format('Blocage automatique : %s échecs en 1 heure', v_n_heure), now() + make_interval(hours => v_p.blocage_ip_heures), true, 'système')
      on conflict (ip) do update set jusqu_a = excluded.jusqu_a, motif = excluded.motif, auto = true;
    perform public.signaler('ip_bloquee_auto', 'critique', v_ip, v_email, jsonb_build_object('echecs_heure', v_n_heure));
  end if;

  -- Attaque distribuée sur un même compte (plusieurs IP)
  select count(distinct ip) into v_n_email from public.connexions
   where email = v_email and not succes and le > now() - interval '1 hour';
  if v_n_email = 5 then
    perform public.signaler('attaque_distribuee', 'critique', v_ip, v_email, jsonb_build_object('ip_distinctes_heure', v_n_email));
  end if;

  if v_motif = 'mfa' then
    perform public.signaler('echec_double_facteur', 'haute', v_ip, v_email, '{}'::jsonb);
  end if;
end $$;

-- Après une connexion réussie (étape mot de passe puis étape double facteur).
create or replace function public.connexion_reussie(p_etape text default 'mfa')
returns json language plpgsql security definer set search_path = public as $$
declare v_ip text := public.client_ip(); v_email text := public.email_jwt(); v_a public.admins;
begin
  if auth.uid() is null then return json_build_object('ok', false); end if;
  select * into v_a from public.admins where user_id = auth.uid() or email = v_email limit 1;
  if v_a.email is null or not v_a.actif then
    insert into public.connexions (email, user_id, succes, motif, ip, user_agent) values (v_email, auth.uid(), false, 'non_autorise', v_ip, public.client_ua());
    perform public.signaler('acces_refuse', 'haute', v_ip, v_email, jsonb_build_object('raison', case when v_a.email is null then 'compte non administrateur' else 'compte désactivé' end));
    return json_build_object('ok', false);
  end if;
  if v_a.user_id is null then update public.admins set user_id = auth.uid() where email = v_a.email; end if;
  insert into public.connexions (email, user_id, succes, motif, ip, user_agent)
    values (v_email, auth.uid(), true, case when p_etape = 'mot_de_passe' then 'mot_de_passe_ok' else 'connecte' end, v_ip, public.client_ua());
  if p_etape <> 'mot_de_passe' then
    update public.admins set derniere_connexion = now() where email = v_a.email;
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.deconnexion(p_motif text default 'deconnexion')
returns void language sql security definer set search_path = public as $$
  insert into public.connexions (email, user_id, succes, motif, ip, user_agent)
  select public.email_jwt(), auth.uid(), true, case when p_motif = 'inactivite' then 'deconnexion_inactivite' else 'deconnexion' end, public.client_ip(), public.client_ua()
  where auth.uid() is not null
$$;

-- Statut du compte connecté (accessible avant la double authentification).
create or replace function public.mon_statut() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('email', a.email, 'nom', a.nom, 'role', a.role, 'actif', a.actif, 'mdp_defini', a.mdp_defini)
  from public.admins a where a.user_id = auth.uid()
$$;

create or replace function public.marquer_mdp_defini() returns void
language sql security definer set search_path = public as $$
  update public.admins set mdp_defini = true where user_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- 5. FONCTIONS PUBLIQUES DE L'APPLICATION
-- -----------------------------------------------------------------------------

create or replace function public.config_publique() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'annonce', p.annonce, 'annonce_niveau', p.annonce_niveau,
    'maintenance', p.maintenance, 'maintenance_message', p.maintenance_message,
    'referentiel_version', (select version from public.referentiels where statut = 'publie'))
  from public.parametres p where p.id = 1
$$;

create or replace function public.referentiel_officiel() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('version', r.version, 'publie_le', r.publie_le, 'contenu', r.contenu)
  from public.referentiels r where r.statut = 'publie'
$$;

create or replace function public.suivre(p_type text, p_session text, p_departement text default null,
                                         p_culture text default null, p_appareil text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ip text := public.client_ip();
begin
  if p_type not in ('visite','calcul','export_ppf','export_csv','export_sauvegarde','import_parcelles','nouvelle_campagne','exemple') then return; end if;
  if public.ip_est_bloquee(v_ip) then return; end if;
  if not public.limiter_debit('suivi', v_ip) then return; end if;
  insert into public.evenements (type, session, departement, culture, appareil)
  values (p_type, left(p_session, 40), left(p_departement, 3), left(p_culture, 20),
          case when p_appareil in ('mobile','tablette','ordinateur') then p_appareil else null end);
end $$;

-- -----------------------------------------------------------------------------
-- 6. FONCTIONS DU BACKOFFICE
-- -----------------------------------------------------------------------------

create or replace function public.statistiques(p_jours int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_debut timestamptz := now() - make_interval(days => greatest(1, least(p_jours, 730)));
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return json_build_object(
    'par_jour', (select coalesce(json_agg(x order by x.jour), '[]'::json) from (
        select (date_trunc('day', le at time zone 'Europe/Paris'))::date as jour,
               count(*) filter (where type = 'visite') as visites,
               count(*) filter (where type = 'calcul') as calculs,
               count(*) filter (where type like 'export%') as exports,
               count(distinct session) as sessions
        from public.evenements where le >= v_debut group by 1) x),
    'totaux', (select json_build_object(
        'visites', count(*) filter (where type = 'visite'),
        'calculs', count(*) filter (where type = 'calcul'),
        'exports', count(*) filter (where type like 'export%'),
        'sessions', count(distinct session))
        from public.evenements where le >= v_debut),
    'par_departement', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
        select coalesce(departement, '?') as cle, count(distinct session) as n
        from public.evenements where le >= v_debut group by 1) x),
    'par_culture', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
        select coalesce(culture, '?') as cle, count(*) as n
        from public.evenements where le >= v_debut and type = 'calcul' group by 1 order by 2 desc limit 15) x),
    'par_appareil', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
        select coalesce(appareil, '?') as cle, count(distinct session) as n
        from public.evenements where le >= v_debut group by 1) x),
    'par_type', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
        select type as cle, count(*) as n from public.evenements where le >= v_debut group by 1) x),
    'connexions', (select json_build_object(
        'reussies', count(*) filter (where succes and motif = 'connecte'),
        'echecs', count(*) filter (where not succes),
        'ip_distinctes', count(distinct ip))
        from public.connexions where le >= v_debut),
    'connexions_par_jour', (select coalesce(json_agg(x order by x.jour), '[]'::json) from (
        select (date_trunc('day', le at time zone 'Europe/Paris'))::date as jour,
               count(*) filter (where succes and motif = 'connecte') as reussies,
               count(*) filter (where not succes) as echecs
        from public.connexions where le >= v_debut group by 1) x),
    'securite_par_jour', (select coalesce(json_agg(x order by x.jour), '[]'::json) from (
        select (date_trunc('day', le at time zone 'Europe/Paris'))::date as jour, count(*) as n
        from public.securite where le >= v_debut group by 1) x),
    'securite_par_type', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
        select type as cle, count(*) as n from public.securite where le >= v_debut group by 1) x),
    'securite_24h', (select count(*) from public.securite where le >= now() - interval '24 hours'),
    'securite_non_traites', (select count(*) from public.securite where not traite and gravite in ('haute','critique')),
    'ip_suspectes', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
        select ip as cle, count(*) as n, max(le) as dernier
        from public.securite where le >= v_debut and ip is not null group by 1 order by 2 desc limit 10) x),
    'ip_bloquees', (select count(*) from public.ip_bloquees where jusqu_a is null or jusqu_a > now()),
    'admins', (select json_build_object('actifs', count(*) filter (where actif), 'total', count(*)) from public.admins),
    'referentiel', (select json_build_object('version', version, 'publie_le', publie_le) from public.referentiels where statut = 'publie')
  );
end $$;

-- Journal d'authentification tenu par Supabase lui-même (fait foi, même si
-- quelqu'un contourne la page de connexion).
create or replace function public.journal_auth(p_limite int default 200)
returns table (le timestamptz, action text, email text, ip text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return query
    select e.created_at, (e.payload->>'action')::text, coalesce(e.payload->>'actor_username', e.payload->'traits'->>'user_email')::text, e.ip_address::text
    from auth.audit_log_entries e order by e.created_at desc limit least(greatest(p_limite, 1), 1000);
end $$;

create or replace function public.publier_referentiel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write() then raise exception 'Accès refusé'; end if;
  update public.referentiels set statut = 'archive' where statut = 'publie';
  update public.referentiels set statut = 'publie', publie_le = now(), publie_par = public.email_jwt() where id = p_id;
end $$;

create or replace function public.purger_journaux() returns json
language plpgsql security definer set search_path = public as $$
declare v_j int; v_e int; v_c int; v_s int;
begin
  if not public.is_superadmin() then raise exception 'Accès refusé'; end if;
  select retention_jours into v_j from public.parametres where id = 1;
  delete from public.evenements where le < now() - make_interval(days => v_j); get diagnostics v_e = row_count;
  delete from public.connexions where le < now() - make_interval(days => v_j); get diagnostics v_c = row_count;
  delete from public.securite   where le < now() - make_interval(days => v_j) and traite; get diagnostics v_s = row_count;
  delete from public.debits     where minute < now() - interval '1 day';
  delete from public.ip_bloquees where jusqu_a is not null and jusqu_a < now() - interval '30 days';
  insert into public.journal_admin (acteur, action, cible, details)
    values (public.email_jwt(), 'PURGE', 'journaux', json_build_object('evenements', v_e, 'connexions', v_c, 'securite', v_s, 'retention_jours', v_j)::jsonb);
  return json_build_object('evenements', v_e, 'connexions', v_c, 'securite', v_s);
end $$;

-- -----------------------------------------------------------------------------
-- 7. JOURNAL D'ADMINISTRATION ET GARDE-FOUS
-- -----------------------------------------------------------------------------

create or replace function public.journaliser() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
        v_cible text;
begin
  -- on n'archive pas le contenu complet du référentiel dans le journal
  v_old := v_old - 'contenu'; v_new := v_new - 'contenu';
  v_cible := tg_table_name || coalesce(' ' || coalesce(v_new->>'email', v_old->>'email', v_new->>'ip', v_old->>'ip',
              'v' || coalesce(v_new->>'version', v_old->>'version')), '');
  insert into public.journal_admin (acteur, action, cible, details)
  values (coalesce(nullif(public.email_jwt(), ''), 'système'), tg_op, v_cible, jsonb_build_object('avant', v_old, 'apres', v_new));
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['admins','parametres','referentiels','ip_bloquees'] loop
    execute format('drop trigger if exists gren_journal on public.%I', t);
    execute format('create trigger gren_journal after insert or update or delete on public.%I for each row execute function public.journaliser()', t);
  end loop;
end $$;

-- Impossible de supprimer, désactiver ou rétrograder le dernier super-administrateur.
create or replace function public.proteger_superadmin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'superadmin' and old.actif
     and (tg_op = 'DELETE' or new.role <> 'superadmin' or not new.actif)
     and not exists (select 1 from public.admins where role = 'superadmin' and actif and email <> old.email) then
    raise exception 'Il doit rester au moins un super-administrateur actif.';
  end if;
  if tg_op = 'UPDATE' then
    new.email := old.email;          -- l'adresse ne se modifie pas : supprimer et recréer
    if new.user_id is distinct from old.user_id and not (old.user_id is null) then new.user_id := old.user_id; end if;
    return new;
  end if;
  return old;
end $$;
drop trigger if exists gren_proteger_superadmin on public.admins;
create trigger gren_proteger_superadmin before update or delete on public.admins
  for each row execute function public.proteger_superadmin();

create or replace function public.horodater_parametres() returns trigger
language plpgsql as $$ begin new.modifie_le := now(); new.modifie_par := public.email_jwt(); new.id := 1; return new; end $$;
drop trigger if exists gren_horodater on public.parametres;
create trigger gren_horodater before update on public.parametres for each row execute function public.horodater_parametres();

-- -----------------------------------------------------------------------------
-- 8. SÉCURITÉ AU NIVEAU DES LIGNES (RLS)
-- -----------------------------------------------------------------------------

alter table public.admins        enable row level security;
alter table public.parametres    enable row level security;
alter table public.referentiels  enable row level security;
alter table public.evenements    enable row level security;
alter table public.connexions    enable row level security;
alter table public.securite      enable row level security;
alter table public.ip_bloquees   enable row level security;
alter table public.debits        enable row level security;
alter table public.journal_admin enable row level security;

-- Aucun accès direct aux tables pour les visiteurs anonymes.
revoke all on public.admins, public.parametres, public.referentiels, public.evenements, public.connexions,
              public.securite, public.ip_bloquees, public.debits, public.journal_admin from anon;
revoke all on public.debits from authenticated;

do $$ declare t text; begin
  foreach t in array array['admins','parametres','referentiels','evenements','connexions','securite','ip_bloquees','journal_admin'] loop
    execute format('drop policy if exists lecture_admin on public.%I', t);
    execute format('create policy lecture_admin on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists ecriture_superadmin on public.admins;
create policy ecriture_superadmin on public.admins for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists modification on public.parametres;
create policy modification on public.parametres for update to authenticated
  using (public.can_write()) with check (public.can_write());

drop policy if exists creation on public.referentiels;
create policy creation on public.referentiels for insert to authenticated
  with check (public.can_write() and statut = 'brouillon');
drop policy if exists modification on public.referentiels;
create policy modification on public.referentiels for update to authenticated
  using (public.can_write() and statut = 'brouillon') with check (public.can_write() and statut = 'brouillon');
drop policy if exists suppression on public.referentiels;
create policy suppression on public.referentiels for delete to authenticated
  using (public.can_write() and statut = 'brouillon');

drop policy if exists traitement on public.securite;
create policy traitement on public.securite for update to authenticated
  using (public.can_write()) with check (public.can_write());

drop policy if exists gestion on public.ip_bloquees;
create policy gestion on public.ip_bloquees for all to authenticated
  using (public.can_write()) with check (public.can_write());

-- Fonctions : seules celles prévues sont appelables par les visiteurs.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.avant_connexion(text, text), public.echec_connexion(text, text),
  public.config_publique(), public.referentiel_officiel(), public.suivre(text, text, text, text, text) to anon, authenticated;
grant execute on function public.connexion_reussie(text), public.deconnexion(text), public.mon_statut(), public.marquer_mdp_defini(),
  public.statistiques(int), public.journal_auth(int), public.publier_referentiel(bigint), public.purger_journaux(),
  public.admin_role(), public.is_admin(), public.can_write(), public.is_superadmin(), public.email_jwt() to authenticated;

-- -----------------------------------------------------------------------------
-- 9. PREMIER SUPER-ADMINISTRATEUR — REMPLACEZ L'ADRESSE CI-DESSOUS
-- -----------------------------------------------------------------------------
insert into public.admins (email, nom, role, cree_par)
values (lower('votre.adresse@exemple.fr'), 'Super-administrateur', 'superadmin', 'installation')
on conflict (email) do update set role = 'superadmin', actif = true;
