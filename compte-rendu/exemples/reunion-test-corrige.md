# Corrigé de la réunion de test

Fichier : `reunion-test.mp3` — durée 01:59 — 4 interlocuteurs, voix de synthèse.

## Interlocuteurs

- **L1** : Claire Martin, directrice (animatrice)
- **L2** : Paul Durand, responsable financier
- **L3** : Sophie Bernard, cheffe de projet travaux
- **L4** : Marc Petit, représentant des parents d'élèves

## Niveaux d'audibilité utilisés

- **clair** : voix proche du micro, nette
- **faible** : voix éloignée du micro (-14 dB, étouffée)
- **tres_faible** : voix très éloignée (-24 dB, étouffée), à peine audible
- **bruit** : voix normale couverte par un bruit (papiers, chaises)
- **chevauchement** : deux personnes parlent en même temps

## Transcription de référence

| # | Début | Interlocuteur | Audibilité | Texte exact | Incohérence attendue |
|---|---|---|---|---|---|
| 1 | 00:01 | L1 | clair | Bonjour à tous, merci d'être présents. L'ordre du jour porte sur le budget deux mille vingt-sept du programme de rénovation des écoles. | — |
| 2 | 00:09 | L2 | clair | Merci. Pour rappel, l'enveloppe votée est de deux virgule quatre millions d'euros, dont huit cent mille euros déjà engagés. | — |
| 3 | 00:17 | L3 | clair | Sur les huit écoles prévues, cinq chantiers sont terminés et trois restent à lancer au printemps. | — |
| 4 | 00:24 | L1 | clair | Très bien. Quel est le calendrier pour les trois écoles restantes ? | — |
| 5 | 00:28 | L3 | faible | Les appels d'offres partent en janvier, pour un démarrage des travaux en avril et une fin avant la rentrée de septembre. | Imprécision : fin avant la rentrée annoncée pour les trois écoles, alors que Jules-Ferry est décalée ensuite. |
| 6 | 00:35 | L2 | clair | Attention, il nous reste donc un virgule neuf million d'euros, ce qui couvre largement les trois chantiers. | Chiffre faux : 2,4 M€ - 0,8 M€ = 1,6 M€ et non 1,9 M€. |
| 7 | 00:42 | L4 | tres_faible | Je voudrais signaler que l'école Jules-Ferry a des problèmes d'amiante, ce qui va décaler le chantier. | Passage à peine audible : vérifier la transcription. |
| 8 | 00:49 | L3 | clair | C'est exact, le diagnostic amiante est attendu pour fin février. Le chantier ne pourra démarrer qu'en juin. | — |
| 9 | 00:56 | L1 | bruit | Donc les trois chantiers démarreront tous en avril comme prévu, parfait. | Contradiction avec l'intervention précédente (Jules-Ferry en juin). Passage couvert par un bruit. |
| 10 | 01:01 | L4 | faible | Il faudrait aussi prévoir une réunion avec les parents d'élèves pour les informer du calendrier des travaux d'été. | — |
| 11 | 01:09 | L2 | clair | Concernant le coût par école, nous sommes à environ trois cent mille euros par chantier, donc neuf cent mille euros pour les trois. | — |
| 12 | 01:15 | L3 | chevauchement | Plutôt quatre cent mille pour Jules-Ferry, à cause du désamiantage. | Chevauchement de voix : attribution à vérifier ; contredit l'estimation de 900 000 € (soit environ 1 M€). |
| 13 | 01:20 | L2 | clair | Même avec quatre cent mille euros, le total reste de neuf cent mille euros, nous sommes donc dans l'enveloppe. | Calcul faux : 300 000 + 300 000 + 400 000 = 1 000 000 €. |
| 14 | 01:27 | L4 | tres_faible | Et les sanitaires de l'école Pasteur, ils sont prévus dans le programme ? | Passage à peine audible. |
| 15 | 01:32 | L1 | clair | Bonne question. Sophie, pouvez-vous vérifier et nous répondre avant la prochaine réunion ? | — |
| 16 | 01:37 | L3 | clair | Oui, je vérifie et je vous envoie une note d'ici la fin du mois. | — |
| 17 | 01:43 | L2 | faible | Je propose de valider le lancement des appels d'offres en janvier et de faire un point budgétaire en mars. | — |
| 18 | 01:50 | L1 | clair | D'accord. Décision : lancement des appels d'offres en janvier. Paul prépare le point budgétaire pour février. Merci à tous. | Contradiction : le point budgétaire était proposé pour mars. |

## Ce que l'application devrait faire

- Trouver **4 interlocuteurs**. Les passages très faibles et le chevauchement sont les plus difficiles à attribuer.
- Signaler en orange/rouge : le reste de 1,9 M€ (au lieu de 1,6 M€), le démarrage « tous en avril » (contredit par juin),
  le total de 900 000 € (au lieu de 1 M€) et le point budgétaire « février » (au lieu de mars).
- Les passages à peine audibles peuvent être mal transcrits : c'est normal, ils doivent ressortir comme « à vérifier ».