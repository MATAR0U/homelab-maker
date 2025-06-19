import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export default async function handler(req, res) {
  console.log('[handler] Requête reçue, méthode:', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { configPath, projectName, dockerCompose } = req.body;
  if (!configPath || !dockerCompose || !projectName) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  const projectDir = path.join(configPath, projectName);
  const composeFilePath = path.join(projectDir, 'docker-compose.generated.yml');
  const projectFlag = `-p ${projectName}`;

  try {
    const stat = await fs.stat(projectDir);
    if (stat.isDirectory()) {
      console.log(`[handler] Dossier ${projectDir} existant, suppression...`);
      await fs.rm(projectDir, { recursive: true, force: true });
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return res.status(500).json({ error: 'Erreur accès fichier', details: err.message });
    }
  }


  try {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(composeFilePath, dockerCompose, 'utf8');
    console.log(`[handler] docker-compose écrit dans ${composeFilePath}`);

    const dockerComposeCmd = (await execAsync('which docker compose')
      .then(() => 'docker compose')
      .catch(() => 'docker-compose'));

    await execAsync(`${dockerComposeCmd} -f ${composeFilePath} config`);
    await execAsync(`${dockerComposeCmd} ${projectFlag} -f ${composeFilePath} up -d`, { cwd: projectDir });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[handler] Erreur:', err);
    return res.status(500).json({ error: 'Erreur pendant le déploiement', details: err.message });
  }
}
