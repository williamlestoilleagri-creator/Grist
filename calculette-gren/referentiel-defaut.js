/* Calculette GREN — référentiel par défaut et description des tables (partagé application / backoffice).
   ⚠ Valeurs INDICATIVES inspirées de la méthode du bilan GREN Bretagne : à vérifier et remplacer
   par les valeurs de l'arrêté référentiel régional en vigueur. Le référentiel publié depuis le
   backoffice remplace ces valeurs dans l'application. */
"use strict";
var DEPTS = {"22":"Côtes-d'Armor","29":"Finistère","35":"Ille-et-Vilaine","56":"Morbihan"};
var REF_DEFAULT = {
  version: 1,
  params: {
    plafondOrga: 170,      // kg N organique total / ha SAU / an (Directive Nitrates)
    plafondZAR: 210,       // kg N total / ha (organique + minéral) — alerte ZAR / BV
    nUGB: 85,              // kg N excrété / UGB / an (pâturage)
    keqPature: 0.4,        // coefficient d'efficacité des restitutions au pâturage
    pailleExportee: 10,    // correction (+) si paille exportée
    pailleEnfouie: -10,    // correction (−) si paille enfouie
    cipanLimite: "12-01",  // destruction avant cette date = précoce
    arrondi: 5             // arrondi de la dose finale (kg N/ha)
  },
  cultures: [
    {id:"ble",  nom:"Blé tendre d'hiver", cat:"automne",  unite:"q/ha",  methode:"bilan",   b:3.0, rf:20, irrig:0,  forfait:0,   plafond:240, prec:"cereale", rdt22:80, rdt29:76, rdt35:82, rdt56:75},
    {id:"orgh", nom:"Orge d'hiver",       cat:"automne",  unite:"q/ha",  methode:"bilan",   b:2.5, rf:20, irrig:0,  forfait:0,   plafond:200, prec:"cereale", rdt22:75, rdt29:72, rdt35:76, rdt56:70},
    {id:"orgp", nom:"Orge de printemps",  cat:"printemps",unite:"q/ha",  methode:"bilan",   b:2.2, rf:20, irrig:0,  forfait:0,   plafond:160, prec:"cereale", rdt22:62, rdt29:60, rdt35:62, rdt56:58},
    {id:"trit", nom:"Triticale",          cat:"automne",  unite:"q/ha",  methode:"bilan",   b:2.6, rf:20, irrig:0,  forfait:0,   plafond:200, prec:"cereale", rdt22:70, rdt29:68, rdt35:70, rdt56:66},
    {id:"avoi", nom:"Avoine d'hiver",     cat:"automne",  unite:"q/ha",  methode:"bilan",   b:2.2, rf:20, irrig:0,  forfait:0,   plafond:150, prec:"cereale", rdt22:60, rdt29:58, rdt35:60, rdt56:56},
    {id:"colz", nom:"Colza d'hiver",      cat:"automne",  unite:"q/ha",  methode:"bilan",   b:6.5, rf:20, irrig:0,  forfait:0,   plafond:220, prec:"colza",   rdt22:36, rdt29:35, rdt35:37, rdt56:34},
    {id:"maig", nom:"Maïs grain",         cat:"printemps",unite:"q/ha",  methode:"bilan",   b:2.2, rf:30, irrig:20, forfait:0,   plafond:220, prec:"maisg",   rdt22:95, rdt29:92, rdt35:98, rdt56:92},
    {id:"maie", nom:"Maïs ensilage",      cat:"printemps",unite:"t MS/ha",methode:"bilan",  b:13,  rf:30, irrig:20, forfait:0,   plafond:220, prec:"maise",   rdt22:14, rdt29:13.5,rdt35:14.5,rdt56:13.5},
    {id:"prfa", nom:"Prairie temporaire (fauche/ensilage)",cat:"prairie",unite:"t MS/ha",methode:"bilan",b:25,rf:0,irrig:0,forfait:0,plafond:250,prec:"prairie",rdt22:9,rdt29:9.5,rdt35:8.5,rdt56:8.5},
    {id:"prpa", nom:"Prairie pâturée",    cat:"prairie",  unite:"t MS/ha",methode:"bilan",  b:25,  rf:0,  irrig:0,  forfait:0,   plafond:200, prec:"prairie", rdt22:8, rdt29:8.5, rdt35:7.5, rdt56:7.5},
    {id:"pdt",  nom:"Pomme de terre",     cat:"printemps",unite:"t/ha",  methode:"bilan",   b:4.5, rf:30, irrig:20, forfait:0,   plafond:240, prec:"legume",  rdt22:45, rdt29:45, rdt35:42, rdt56:42},
    {id:"chfl", nom:"Chou-fleur",         cat:"automne",  unite:"—",     methode:"forfait", b:0,   rf:0,  irrig:0,  forfait:180, plafond:220, prec:"legume",  rdt22:0, rdt29:0, rdt35:0, rdt56:0},
    {id:"artc", nom:"Artichaut",          cat:"printemps",unite:"—",     methode:"forfait", b:0,   rf:0,  irrig:0,  forfait:140, plafond:180, prec:"legume",  rdt22:0, rdt29:0, rdt35:0, rdt56:0},
    {id:"hari", nom:"Haricot / légume d'industrie",cat:"printemps",unite:"—",methode:"forfait",b:0,rf:0,irrig:0,forfait:60,plafond:100,prec:"legume",rdt22:0,rdt29:0,rdt35:0,rdt56:0},
    {id:"sarr", nom:"Sarrasin (blé noir)",cat:"printemps",unite:"—",     methode:"forfait", b:0,   rf:0,  irrig:0,  forfait:30,  plafond:40,  prec:"cereale", rdt22:0, rdt29:0, rdt35:0, rdt56:0},
    {id:"pois", nom:"Pois / féverole (légumineuse)",cat:"printemps",unite:"q/ha",methode:"forfait",b:0,rf:0,irrig:0,forfait:0,plafond:0,prec:"legumineuse",rdt22:45,rdt29:45,rdt35:45,rdt56:42}
  ],
  precedents: [
    {id:"cereale",     nom:"Céréale à paille",                     effet:0},
    {id:"maisg",       nom:"Maïs grain",                           effet:0},
    {id:"maise",       nom:"Maïs ensilage",                        effet:0},
    {id:"colza",       nom:"Colza",                                effet:20},
    {id:"legumineuse", nom:"Légumineuse (pois, féverole…)",        effet:30},
    {id:"legume",      nom:"Légumes / pomme de terre",             effet:20},
    {id:"prairie",     nom:"Prairie en place (non retournée)",     effet:0},
    {id:"pr1",         nom:"Prairie retournée — 1re année",        effet:100},
    {id:"pr2",         nom:"Prairie retournée — 2e année",         effet:50},
    {id:"pr3",         nom:"Prairie retournée — 3e année",         effet:20},
    {id:"jach",        nom:"Jachère / gel",                        effet:20}
  ],
  sols: [
    {id:"limsain", nom:"Limon sain profond",              mhAut:40, mhPri:90,  mhPra:60, rshAut:40, rshPri:50},
    {id:"limhyd",  nom:"Limon hydromorphe",               mhAut:30, mhPri:70,  mhPra:50, rshAut:35, rshPri:45},
    {id:"schist",  nom:"Sol sur schiste",                 mhAut:35, mhPri:80,  mhPra:55, rshAut:35, rshPri:45},
    {id:"granit",  nom:"Sol sur granite / sableux",       mhAut:35, mhPri:80,  mhPra:50, rshAut:30, rshPri:40},
    {id:"argil",   nom:"Sol argileux",                    mhAut:30, mhPri:70,  mhPra:50, rshAut:40, rshPri:50},
    {id:"humif",   nom:"Sol humifère (MO > 5 %)",         mhAut:60, mhPri:120, mhPra:80, rshAut:50, rshPri:60}
  ],
  cipan: [
    {id:"aucune",  nom:"Aucun couvert",                       precoce:0,  tardif:0},
    {id:"nonleg",  nom:"CIPAN non légumineuse (moutarde, phacélie…)", precoce:5, tardif:15},
    {id:"melange", nom:"Mélange avec légumineuse",            precoce:15, tardif:25},
    {id:"repous",  nom:"Repousses de céréales / colza",       precoce:0,  tardif:10},
    {id:"derob",   nom:"Dérobée récoltée (RGI, méteil…)",     precoce:0,  tardif:5}
  ],
  effluents: [
    {id:"lisporc", nom:"Lisier de porc",            unite:"m³", type:"II", n:5.0, keqAut:0.10, keqHiv:0.55, keqPri:0.65, arriere:0.03},
    {id:"lisbov",  nom:"Lisier de bovins",          unite:"m³", type:"II", n:3.0, keqAut:0.10, keqHiv:0.45, keqPri:0.55, arriere:0.05},
    {id:"fumbov",  nom:"Fumier de bovins",          unite:"t",  type:"I",  n:5.5, keqAut:0.05, keqHiv:0.15, keqPri:0.25, arriere:0.15},
    {id:"fumporc", nom:"Fumier de porc",            unite:"t",  type:"I",  n:7.5, keqAut:0.10, keqHiv:0.20, keqPri:0.30, arriere:0.10},
    {id:"fientes", nom:"Fientes de volailles",      unite:"t",  type:"II", n:30,  keqAut:0.10, keqHiv:0.55, keqPri:0.60, arriere:0.05},
    {id:"fumvol",  nom:"Fumier de volailles",       unite:"t",  type:"II", n:22,  keqAut:0.10, keqHiv:0.45, keqPri:0.50, arriere:0.05},
    {id:"compost", nom:"Compost de fumier",         unite:"t",  type:"I",  n:8,   keqAut:0.05, keqHiv:0.10, keqPri:0.15, arriere:0.10},
    {id:"digest",  nom:"Digestat liquide",          unite:"m³", type:"II", n:4.5, keqAut:0.10, keqHiv:0.60, keqPri:0.65, arriere:0.03}
  ],
  mineraux: [
    {id:"amo",  nom:"Ammonitrate 33,5", teneur:33.5},
    {id:"sol39",nom:"Solution azotée 39", teneur:39},
    {id:"uree", nom:"Urée 46", teneur:46},
    {id:"dap",  nom:"18-46-0 (DAP)", teneur:18},
    {id:"nkg",  nom:"Autre (kg N saisis directement)", teneur:100}
  ],
  animaux: [
    {id:"vl",  nom:"Vache laitière",       ugb:1.0},
    {id:"va",  nom:"Vache allaitante",     ugb:0.85},
    {id:"g2",  nom:"Génisse > 2 ans",      ugb:0.8},
    {id:"g1",  nom:"Génisse 1–2 ans",      ugb:0.6},
    {id:"g0",  nom:"Veau / génisse < 1 an",ugb:0.4},
    {id:"tau", nom:"Taureau",              ugb:1.0},
    {id:"bre", nom:"Brebis",               ugb:0.15},
    {id:"che", nom:"Chèvre",               ugb:0.17},
    {id:"equ", nom:"Cheval",               ugb:0.85}
  ],
  // Calendrier d'interdiction d'épandage (MM-JJ). cat : automne | printemps | prairie ; zone : toutes | ZAR | BV
  calendrier: [
    {cat:"automne",   type:"I",   debut:"11-15", fin:"01-15", zone:"toutes"},
    {cat:"automne",   type:"II",  debut:"10-01", fin:"01-31", zone:"toutes"},
    {cat:"automne",   type:"III", debut:"09-01", fin:"01-31", zone:"toutes"},
    {cat:"printemps", type:"I",   debut:"07-01", fin:"01-15", zone:"toutes"},
    {cat:"printemps", type:"II",  debut:"07-01", fin:"01-31", zone:"toutes"},
    {cat:"printemps", type:"III", debut:"07-01", fin:"02-15", zone:"toutes"},
    {cat:"prairie",   type:"I",   debut:"12-15", fin:"01-15", zone:"toutes"},
    {cat:"prairie",   type:"II",  debut:"10-01", fin:"01-31", zone:"toutes"},
    {cat:"prairie",   type:"III", debut:"10-01", fin:"01-31", zone:"toutes"}
  ]
};

var REF_TABLES = [
  {k:"cultures", t:"Cultures (besoins, plafonds, rendements de référence)", cols:[
    ["id","Code"],["nom","Nom","w"],["cat","Catégorie",["automne","printemps","prairie"]],["unite","Unité rdt"],["methode","Méthode",["bilan","forfait"]],
    ["b","b (kg N/unité)","n"],["rf","Rf","n"],["irrig","+ irrig.","n"],["forfait","Forfait","n"],["plafond","Plafond","n"],["prec","Devient précédent","prec"],
    ["rdt22","Rdt 22","n"],["rdt29","Rdt 29","n"],["rdt35","Rdt 35","n"],["rdt56","Rdt 56","n"]]},
  {k:"sols", t:"Types de sol (minéralisation Mh et RSH forfaitaire, kg N/ha)", cols:[
    ["id","Code"],["nom","Nom","w"],["mhAut","Mh automne","n"],["mhPri","Mh printemps","n"],["mhPra","Mh prairie","n"],["rshAut","RSH cult. hiver","n"],["rshPri","RSH cult. print.","n"]]},
  {k:"precedents", t:"Précédents culturaux (fourniture, kg N/ha)", cols:[["id","Code"],["nom","Nom","w"],["effet","Effet","n"]]},
  {k:"cipan", t:"Couverts / CIPAN (fourniture, kg N/ha)", cols:[["id","Code"],["nom","Nom","w"],["precoce","Destruction précoce","n"],["tardif","Destruction tardive","n"]]},
  {k:"effluents", t:"Effluents (teneur N et coefficients d'équivalence engrais Keq)", cols:[
    ["id","Code"],["nom","Nom","w"],["unite","Unité",["t","m³"]],["type","Type",["I","II"]],["n","kg N/unité","n"],["keqAut","Keq automne","n"],["keqHiv","Keq fin hiver","n"],["keqPri","Keq printemps","n"],["arriere","Arrière-effet N+1","n"]]},
  {k:"mineraux", t:"Engrais minéraux", cols:[["id","Code"],["nom","Nom","w"],["teneur","% N","n"]]},
  {k:"animaux", t:"Convertisseur bétail → UGB", cols:[["id","Code"],["nom","Catégorie","w"],["ugb","UGB/tête","n"]]},
  {k:"calendrier", t:"Calendrier d'interdiction d'épandage (MM-JJ)", cols:[
    ["cat","Culture",["automne","printemps","prairie"]],["type","Type fertilisant",["I","II","III"]],["debut","Début (MM-JJ)"],["fin","Fin (MM-JJ)"],["zone","Zone",["toutes","ZAR","BV"]]]}
];
var PARAMS = [["plafondOrga","Plafond azote organique (kg N/ha SAU)"],["plafondZAR","Seuil d'alerte N total ZAR / BV (kg N/ha)"],["nUGB","Azote excrété (kg N/UGB/an)"],["keqPature","Keq restitutions au pâturage"],["pailleExportee","Correction paille exportée (kg N/ha)"],["pailleEnfouie","Correction paille enfouie (kg N/ha)"],["cipanLimite","Destruction CIPAN précoce avant (MM-JJ)"],["arrondi","Arrondi de la dose (kg N/ha)"]];
