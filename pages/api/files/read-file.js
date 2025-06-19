import fs from 'fs/promises';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath requis' });

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return res.status(200).json({ content });
  } catch (err) {
    return res.status(404).json({ error: 'Fichier introuvable', details: err.message });
  }
}
