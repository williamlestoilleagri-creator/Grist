# Widgets Grist

| Fichier | Description |
|---|---|
| `erp-sap.html` | ERP intégré « façon SAP » (ventes, achats, stocks, comptabilité) |
| `annuaire-adresses.html` | Annuaire d'adresses géocodées (BAN) |
| `grist-assistant-claude.html` | Assistant Claude |

## ERP « façon SAP » (`erp-sap.html`)

### Installation dans Grist

1. Ajoutez une vue **Widget personnalisé** à une page de votre document.
2. Renseignez l'URL du fichier publié (par exemple via GitHub Pages) — ou collez le contenu du fichier dans le **Custom Widget Builder** de Grist.
3. Dans le panneau du widget, réglez **Accès** sur **Accès complet au document**.
4. Au premier lancement, le widget crée ses tables : `ERP_Parametres`, `ERP_Partenaires`, `ERP_Articles`,
   `ERP_Documents`, `ERP_Lignes`, `ERP_Mouvements`, `ERP_Ecritures`. Elles restent consultables et modifiables dans Grist.
5. Allez dans **Paramétrage (SPRO)** pour saisir votre société, ou cliquez sur « Charger les données de démo ».

Ouvert directement dans un navigateur (hors Grist), le widget passe en **mode démo local** : les données sont stockées dans le navigateur.

### Modules et codes transaction

Tapez un code dans la barre du haut (`Ctrl + /`), comme dans SAP. Les préfixes `/n` et `/o` sont acceptés. On peut aussi y saisir un numéro de document, un code client ou un code article.

| Module | Codes |
|---|---|
| Ventes (SD) | `VA21`/`VA25` devis · `VA01`/`VA05` commandes · `VF01`/`VF05` factures · `XD01`/`XD03` clients · `FBL5N` postes ouverts |
| Achats (MM) | `ME21N`/`ME2N` commandes d'achat · `MIRO`/`MIR5` factures fournisseurs · `XK01`/`XK03` fournisseurs · `FBL1N` |
| Stocks (MM-IM) | `MM01`/`MM60` articles · `MMBE` aperçu des stocks · `MB51` mouvements · `MB1C` saisie · `MI01` inventaire |
| Finance (FI) | `FB03` journal · `FB50` écriture d'OD · `F.01` balance · `FAGLL03` grand livre |
| Système | `SMEN` tableau de bord · `SPRO` paramétrage · `BP` partenaires |

### Flux de documents

- **Ventes** : Devis → (accepté) Commande client → Livraison (sortie de stock au CMP) → Facture (écritures 411 / 70x / 44571) → Encaissement (512 / 411).
- **Achats** : Commande d'achat → Réception (entrée de stock) → Facture fournisseur (60x / 44566 / 401) → Paiement (401 / 512).
- Une facture saisie directement (sans commande) génère elle-même ses mouvements de stock.
- **Réapprovisionnement** : depuis `MMBE`, crée des commandes d'achat en brouillon pour les articles dont le stock projeté
  (stock − réservé + en commande) passe sous le seuil.
- Chaque document affiche son flux (amont/aval), ses mouvements de stock et ses écritures, et s'imprime (devis, confirmation, facture).
