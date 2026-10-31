undefined
## Vérification officielle du SIRET
Un compte Professionnel peut contrôler un SIRET via `/api/company/lookup` (JWT obligatoire). La source ouverte utilisée est l'API officielle Recherche d'Entreprises (DINUM, Sirene/RNE), avec comparaison exacte du SIRET et état actif. La raison sociale est fournie au formulaire. L'identité du représentant et son autorisation ne sont **pas** attestées par la seule API; le statut Premium reste soumis à examen humain avant activation. La saisie et la vérification ne sont pas un KYC automatisé complet.
