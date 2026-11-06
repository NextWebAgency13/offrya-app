'use strict';
// Liens « pour répondre » d'un avis officiel : dossier de consultation (DCE),
// dépôt en ligne ou plateforme de l'acheteur. Les adresses viennent uniquement
// des données officielles publiées (BOAMP/DILA, TED) : aucune page n'est visitée.

const MAX_URL = 600;

function cleanUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value.length > MAX_URL) return null;
  let url;
  try { url = new URL(/^www\./i.test(value) ? 'https://' + value : value); } catch (_e) { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || !url.hostname.includes('.')) return null;
  if (url.username || url.password) return null;
  // L'avis BOAMP/TED lui-même est déjà proposé à part.
  if (/(^|\.)boamp\.fr$/i.test(url.hostname) || /^ted\.europa\.eu$/i.test(url.hostname)) return null;
  return url.toString();
}

function parse(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try { return JSON.parse(value); } catch (_e) { return null; }
}

// Parcourt l'avis et classe chaque adresse selon la rubrique où elle figure.
function collect(node, path, found, depth = 0) {
  if (depth > 40 || node == null) return;
  if (Array.isArray(node)) { for (const item of node) collect(item, path, found, depth + 1); return; }
  if (typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    const here = path + '/' + key;
    if (typeof value === 'string') {
      const k = key.toLowerCase();
      let kind = null;
      if (k === 'urldocconsul' || k === 'urldocument' || k === 'urldce' ||
        (k === 'cbc:uri' && /calltendersdocumentreference|callfortendersdocumentreference/i.test(here))) kind = 'documents';
      else if (k === 'urldepot' || k === 'urlparticipation' || k === 'urlremise' ||
        (k === 'cbc:endpointid' && /tenderrecipientparty/i.test(here))) kind = 'submission';
      else if (k === 'urlprofilach' || k === 'cbc:buyerprofileuri') kind = 'profile';
      if (kind) {
        const url = cleanUrl(value);
        if (url && !found[kind]) found[kind] = url;
      }
    } else collect(value, here, found, depth + 1);
  }
}

function isPlatformHome(url) {
  try { const u = new URL(url); return (u.pathname === '/' || u.pathname === '') && !u.search; } catch (_e) { return true; }
}

// Retourne le meilleur lien et son libellé, ou null.
function respondLink(found) {
  for (const kind of ['documents', 'submission', 'profile']) {
    const url = found && found[kind];
    if (!url) continue;
    const home = isPlatformHome(url);
    return { url, kind: home ? 'platform' : kind };
  }
  return null;
}

function boampRespondLink(donnees) {
  const tree = parse(donnees);
  if (!tree) return null;
  const found = {};
  collect(tree, '', found);
  return respondLink(found);
}

function tedRespondLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const first = v => Array.isArray(v) ? v.map(first).find(Boolean) : (v && typeof v === 'object' ? first(Object.values(v)) : v);
  const found = {};
  const documents = cleanUrl(first(raw['document-url-lot']));
  const submission = cleanUrl(first(raw['submission-url-lot']));
  const profile = cleanUrl(first(raw['buyer-profile']));
  if (documents) found.documents = documents;
  if (submission) found.submission = submission;
  if (profile) found.profile = profile;
  return respondLink(found);
}

const LABELS = {
  documents: 'Dossier de consultation',
  submission: 'Répondre en ligne',
  profile: "Plateforme de l'acheteur",
  platform: "Plateforme de l'acheteur",
};

module.exports = { cleanUrl, boampRespondLink, tedRespondLink, respondLink, isPlatformHome, LABELS };
