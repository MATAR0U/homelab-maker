import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseDir = process.env.BASE_CONFIG_DIR || '/'; // tu peux restreindre ici la racine possible
  let requestedPath = req.query.path || '/';

  // Sécuriser le chemin (éviter ../ etc)
  const safePath = path.resolve(baseDir, '.' + requestedPath);

  // Vérifier que safePath est bien dans baseDir
  if (!safePath.startsWith(path.resolve(baseDir))) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    const entries = await fs.readdir(safePath, { withFileTypes: true });

    const files = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));

    res.status(200).json({ path: requestedPath, files });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire le dossier', details: error.message });
  }
}
