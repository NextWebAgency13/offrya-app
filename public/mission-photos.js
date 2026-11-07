// Photos de mission : ajoutées par l'auteur de la mission, stockées en privé
// (Supabase Storage, espace « offrya-mission-images »). Les règles d'accès en base
// réservent la lecture à l'auteur et aux professionnels autorisés.
// Chaque photo est réenregistrée en JPEG dans le navigateur : taille réduite et
// métadonnées supprimées (position GPS, modèle d'appareil, date de prise de vue).

export const PHOTO_BUCKET = 'offrya-mission-images';
export const MAX_PHOTOS = 6;
const MAX_SIDE = 1600;
const QUALITY = 0.82;
const MAX_INPUT = 25 * 1024 * 1024;
const MAX_OUTPUT = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 3600;

function fileLabel(file) {
  const name = String(file?.name || 'Cette photo').replace(/[\u0000-\u001f<>]/g, '').slice(0, 60);
  return '« ' + name + ' »';
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(source, maxSide, quality) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (!width || !height) throw Error('Image illisible.');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(Error('Conversion de la photo impossible.')), 'image/jpeg', quality));
}

// Prépare une photo choisie par l'utilisateur : JPEG ≤ 1600 px, sans métadonnées.
export async function preparePhoto(file) {
  if (!file || (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || ''))) {
    throw Error(fileLabel(file) + ' n’est pas une image.');
  }
  if (file.size > MAX_INPUT) throw Error(fileLabel(file) + ' est trop lourde (25 Mo maximum).');
  let source;
  try { source = await decode(file); } catch (_) {
    throw Error(fileLabel(file) + ' ne peut pas être lue. Utilisez une photo JPEG, PNG ou WebP.');
  }
  try {
    let blob = await encode(source, MAX_SIDE, QUALITY);
    if (blob.size > MAX_OUTPUT) blob = await encode(source, 1200, 0.72);
    if (blob.size > MAX_OUTPUT) throw Error(fileLabel(file) + ' reste trop lourde après réduction.');
    return blob;
  } finally {
    if (typeof source.close === 'function') source.close();
  }
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Envoie les photos d'une mission ouverte de l'utilisateur. Chemin imposé par la base :
// <identifiant utilisateur>/<identifiant mission>/<fichier>.jpg
export async function uploadMissionPhotos(db, uid, missionId, blobs) {
  let added = 0, failed = 0;
  for (const blob of blobs.slice(0, MAX_PHOTOS)) {
    const path = uid + '/' + missionId + '/' + randomId() + '.jpg';
    const stored = await db.storage.from(PHOTO_BUCKET).upload(path, blob, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
    });
    if (stored.error) { failed++; continue; }
    const row = await db.from('offrya_mission_photos').insert({ mission_id: missionId, object_path: path });
    if (row.error) {
      failed++;
      await db.storage.from(PHOTO_BUCKET).remove([path]);
      continue;
    }
    added++;
  }
  return { added, failed };
}

// Photos d'une mission avec un lien temporaire (1 h) pour chacune.
export async function listMissionPhotos(db, missionId) {
  const rows = await db.from('offrya_mission_photos').select('id,object_path,created_at')
    .eq('mission_id', missionId).order('created_at', { ascending: true }).limit(MAX_PHOTOS * 2);
  if (rows.error) throw rows.error;
  const list = rows.data || [];
  if (!list.length) return [];
  const signed = await db.storage.from(PHOTO_BUCKET).createSignedUrls(list.map(p => p.object_path), SIGNED_URL_SECONDS);
  if (signed.error) throw signed.error;
  const urls = new Map((signed.data || []).filter(x => x?.signedUrl && !x.error).map(x => [x.path, x.signedUrl]));
  return list.map(p => ({ id: p.id, path: p.object_path, url: urls.get(p.object_path) || null })).filter(p => p.url);
}

export async function removeMissionPhoto(db, photo) {
  const removed = await db.storage.from(PHOTO_BUCKET).remove([photo.path]);
  if (removed.error) throw removed.error;
  const row = await db.from('offrya_mission_photos').delete().eq('id', photo.id);
  if (row.error) throw row.error;
}

// À la clôture : retire les fichiers de la mission (la base supprime ensuite les lignes).
export async function purgeMissionPhotos(db, uid, missionId) {
  const folder = uid + '/' + missionId;
  const listed = await db.storage.from(PHOTO_BUCKET).list(folder, { limit: 100 });
  if (listed.error) throw listed.error;
  const paths = (listed.data || []).filter(x => x?.name).map(x => folder + '/' + x.name);
  if (!paths.length) return 0;
  const removed = await db.storage.from(PHOTO_BUCKET).remove(paths);
  if (removed.error) throw removed.error;
  return paths.length;
}
