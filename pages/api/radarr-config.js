import { generateRadarrConfig } from '../../utils/radarr';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { apiKey, configPath } = await generateRadarrConfig();
    res.status(200).json({ success: true, apiKey, configPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
