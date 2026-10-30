'use strict';
const ORIGIN = 'https://boamp-datadila.opendatasoft.com';
const ENDPOINT = `${ORIGIN}/api/explore/v2.0/catalog/datasets/boamp/records`;
function cleanQuery(value) {
  return String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 90);
}
function escapeOds(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function safeUrl(raw, id) {
  try {
    const u = new URL(String(raw));
    if (u.protocol === 'https:' && (u.hostname === 'www.boamp.fr' || u.hostname === 'boamp.fr')) return u.toString();
  } catch (_e) {}
  if (/^\d{2}-\d{3,9}$/.test(id)) return `https://www.boamp.fr/pages/avis/?q=idweb:${encodeURIComponent(id)}`;
  return null;
}
function scalar(v) {
  if (Array.isArray(v)) return v.map(scalar).filter(Boolean).join(', ');
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}
function safeDate(v) {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function normalizeRecord(record) {
  // Explore API v2.0 wraps a row in { record: { fields: ... } }.
  // Explore API v2.1 may return flat rows in results.
  const f = record && typeof record === 'object' ? (record.record?.fields || record.fields || record) : {};
  const id = scalar(f.idweb || f.id).trim();
  const title = scalar(f.objet).trim();
  if (!id || !title) return null;
  const url = safeUrl(f.url_avis, id);
  if (!url) return null;
  return {
    id, title: title.slice(0, 1300), buyer: scalar(f.nomacheteur).slice(0, 250) || 'Acheteur non renseigné',
    departments: scalar(f.code_departement_prestation || f.code_departement).slice(0, 100),
    published: safeDate(f.dateparution), deadline: safeDate(f.datelimitereponse),
    family: scalar(f.famille_libelle).slice(0, 120), nature: scalar(f.nature_libelle).slice(0, 120),
    description: scalar(f.descripteur_libelle).slice(0, 250), url,
    source: 'BOAMP · DILA',
  };
}
function buildBoampUrl({ q = '', dept = '', limit = 20, offset = 0 } = {}) {
  const clean = cleanQuery(q);
  const count = Math.min(50, Math.max(1, Number(limit) || 20));
  const start = Math.min(1000, Math.max(0, Number(offset) || 0));
  const url = new URL(ENDPOINT);
  url.searchParams.set('limit', String(count));
  url.searchParams.set('offset', String(start));
  url.searchParams.set('order_by', 'dateparution desc');
  // ODSQL: official notices whose response deadline is later than now.
  const where = ['datelimitereponse >= now()'];
  if (clean) where.push(`search(objet, descripteur_libelle, "${escapeOds(clean)}")`);
  url.searchParams.set('where', where.join(' AND '));
  if (/^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/i.test(dept)) {
    url.searchParams.set('refine', `code_departement:${dept.toUpperCase()}`);
  }
  return url;
}
async function queryBoamp(options = {}, fetcher = fetch) {
  const url = buildBoampUrl(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetcher(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Source BOAMP indisponible (HTTP ${res.status})`);
    const payload = await res.json();
    const records = Array.isArray(payload.records) ? payload.records
      : Array.isArray(payload.results) ? payload.results : null;
    if (!records) throw new Error('Format de réponse BOAMP inattendu (records/results manquant)');
    const items = records.map(normalizeRecord).filter(Boolean);
    return { items, total: Number(payload.total_count) || items.length, updatedAt: new Date().toISOString(), attribution: 'DILA / BOAMP', sourceUrl: url.toString(), dataset: 'boamp', isLive: true };
  } finally { clearTimeout(timer); }
}
module.exports = { buildBoampUrl, normalizeRecord, queryBoamp, safeUrl, escapeOds };
