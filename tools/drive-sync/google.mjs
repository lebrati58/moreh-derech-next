// Accès en LECTURE SEULE au Drive de l'école (API Google Drive v3), sans dépendance externe.
// Deux méthodes d'authentification, au choix (secrets GitHub, jamais dans le code ni dans le navigateur) :
//  A) GOOGLE_SERVICE_ACCOUNT_JSON : clé JSON d'un compte de service ; le dossier de l'école doit être partagé
//     (lecteur) avec l'adresse « …@….iam.gserviceaccount.com » de ce compte.
//  B) GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN : le robot lit le Drive
//     « comme Lionel » (portée drive.readonly), sans rien partager de plus.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

function b64url(x) { return Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

export function serviceAccountAssertion(sa, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(sign.sign(sa.private_key))}`;
}

export async function getAccessToken(env = process.env, fetchImpl = fetch) {
  let body;
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountAssertion(sa) });
  } else if (env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET });
  } else {
    throw new Error('Aucun accès Google configuré (GOOGLE_SERVICE_ACCOUNT_JSON ou GOOGLE_OAUTH_REFRESH_TOKEN).');
  }
  const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Connexion Google refusée (${r.status}) : ${j.error_description || j.error || 'inconnue'}`);
  return j.access_token;
}

export function createDrive(token, fetchImpl = fetch) {
  async function call(url, { raw = false } = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
      if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * 2 ** attempt)); continue; }
      const t = await r.text().catch(() => '');
      const e = new Error(`Drive ${r.status} : ${t.slice(0, 200)}`); e.status = r.status; throw e;
    }
    throw new Error('Drive indisponible (trop de tentatives)');
  }
  const FIELDS = 'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,version,size,webViewLink,parents,shortcutDetails)';

  async function children(folderId) {
    const out = []; let pageToken = '';
    do {
      const q = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false`, fields: FIELDS, pageSize: '1000',
        supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken } : {}) });
      const j = await call(`${API}/files?${q}`);
      out.push(...(j.files || [])); pageToken = j.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  // Parcours complet de l'arborescence. Chaque fichier reçoit son chemin (« 2. סיורים / סיור 05 … / קובץ »).
  async function walk(rootId, { maxDepth = 6 } = {}) {
    const files = [], folders = [], seen = new Set([rootId]);
    const queue = [{ id: rootId, path: [], depth: 0 }];
    while (queue.length) {
      const f = queue.shift();
      for (const c of await children(f.id)) {
        const target = c.mimeType === 'application/vnd.google-apps.shortcut' && c.shortcutDetails ? c.shortcutDetails : null;
        const mime = target ? target.targetMimeType : c.mimeType, id = target ? target.targetId : c.id;
        if (seen.has(id)) continue; seen.add(id);
        const path = [...f.path, c.name];
        if (mime === FOLDER_MIME) { folders.push({ id, title: c.name, mimeType: mime, path }); if (f.depth + 1 <= maxDepth) queue.push({ id, path, depth: f.depth + 1 }); continue; }
        files.push({ ...c, id, mimeType: mime, path });
      }
    }
    files.folders = folders;
    return files;
  }

  const exportAs = (id, mime) => call(`${API}/files/${id}/export?${new URLSearchParams({ mimeType: mime })}`, { raw: true });
  const download = id => call(`${API}/files/${id}?alt=media&supportsAllDrives=true`, { raw: true });
  return { children, walk, exportAs, download };
}
