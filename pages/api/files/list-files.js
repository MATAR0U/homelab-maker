// pages/api/files/list-files.js
import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { dirPath } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'Le chemin est requis' });
  }

  try {
    const files = await fs.readdir(path.resolve(dirPath));
    return res.status(200).json({ files });
  } catch (err) {
    console.error('Erreur lecture dossier:', err);
    return res.status(500).json({ error: 'Impossible de lire le dossier' });
  }
}
