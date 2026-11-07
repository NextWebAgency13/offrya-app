// Autres plateformes d'appels d'offres : liens de recherche préremplis.
// OFFRYA ne copie pas les annonces de ces sites (leurs conditions interdisent l'extraction) :
// il ouvre simplement la bonne page, avec le métier et la région du professionnel.

const REGION_BY_DEPT = {};
const REGIONS = {
  'auvergne-rhone-alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  'bourgogne-franche-comte': ['21', '25', '39', '58', '70', '71', '89', '90'],
  'bretagne': ['22', '29', '35', '56'],
  'centre-val-de-loire': ['18', '28', '36', '37', '41', '45'],
  'corse': ['2A', '2B'],
  'grand-est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  'hauts-de-france': ['02', '59', '60', '62', '80'],
  'ile-de-france': ['75', '77', '78', '91', '92', '93', '94', '95'],
  'normandie': ['14', '27', '50', '61', '76'],
  'nouvelle-aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  'occitanie': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  'pays-de-la-loire': ['44', '49', '53', '72', '85'],
  'provence-alpes-cote-d-azur': ['04', '05', '06', '13', '83', '84'],
  'outre-mer': ['971', '972', '973', '974', '975', '976'],
};
for (const [region, depts] of Object.entries(REGIONS)) for (const d of depts) REGION_BY_DEPT[d] = region;

const TERM_BY_SECTOR = {
  'Nettoyage': 'nettoyage', 'Espaces verts': 'espaces verts', 'Bâtiment': 'travaux',
  'Informatique': 'informatique', 'Transport': 'transport',
  'Restauration & Hôtellerie': 'restauration', 'Bien-être & Beauté': 'beauté',
};

export function normalizeDept(value) {
  const v = String(value || '').trim().toUpperCase();
  if (/^\d$/.test(v)) return '0' + v;
  return /^(0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/.test(v) ? v : '';
}

export function platformTerm(prefs = {}, typed = '') {
  const own = String(typed || '').trim();
  if (own) return own.slice(0, 60);
  const keyword = String(prefs.keywords || '').trim();
  if (keyword) return keyword.slice(0, 60);
  const sector = (Array.isArray(prefs.sectors) ? prefs.sectors : []).find(s => TERM_BY_SECTOR[s]);
  return sector ? TERM_BY_SECTOR[sector] : '';
}

// Retourne la liste des plateformes utiles pour ce professionnel.
export function tenderPlatforms({ term = '', dept = '' } = {}) {
  const d = normalizeDept(dept);
  const region = REGION_BY_DEPT[d] || '';
  const q = encodeURIComponent(String(term || '').trim().slice(0, 60));
  const list = [
    {
      id: 'place', name: 'PLACE · marchés de l’État',
      note: q ? 'Recherche « ' + decodeURIComponent(q) + ' » sur la plateforme officielle de l’État' : 'Plateforme officielle des achats de l’État',
      url: 'https://www.marches-publics.gouv.fr/?page=Entreprise.EntrepriseAdvancedSearch&AllCons' + (q ? '&keyWord=' + q : ''),
    },
    {
      id: 'emp', name: 'e-marchespublics.com',
      note: region ? 'Appels d’offres de votre région, petites communes comprises' : 'Appels d’offres de toute la France, petites communes comprises',
      url: 'https://www.e-marchespublics.com/appel-offre/' + (region ? region + '/' : ''),
    },
    {
      id: 'aws', name: 'AWS-Achat (marches-publics.info)',
      note: 'Consultations en cours de nombreuses collectivités',
      url: 'https://www.marches-publics.info/Annonces/lister',
    },
    {
      id: 'achatpublic', name: 'achatpublic.com',
      note: 'Profil acheteur de nombreuses villes et départements',
      url: 'https://www.achatpublic.com/',
    },
    {
      id: 'ms', name: 'marches-securises.fr',
      note: 'Plateforme de dépôt utilisée par de nombreux acheteurs',
      url: 'https://www.marches-securises.fr/',
    },
  ];
  if (region === 'ile-de-france') list.push({
    id: 'maximilien', name: 'Maximilien · Île-de-France',
    note: 'Portail régional des marchés publics franciliens', url: 'https://marches.maximilien.fr/entreprise',
  });
  if (region === 'bretagne') list.push({
    id: 'megalis', name: 'Mégalis Bretagne',
    note: 'Portail régional des marchés publics bretons', url: 'https://marches.megalis.bretagne.bzh/entreprise',
  });
  return list;
}
