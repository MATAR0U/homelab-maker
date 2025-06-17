import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

async function waitForConfigXml(appName, configPath, timeout = 60000, interval = 3000) {
  const configXmlPath = path.join(configPath, appName.toLowerCase(), 'config', 'config.xml');
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await fs.access(configXmlPath);
      return configXmlPath;
    } catch {
      await new Promise(r => setTimeout(r, interval));
    }
  }
  return null;
}

async function waitForAppReady({ appName, port, configPath, apiVersion, timeout = 60000, interval = 3000 }) {
  const start = Date.now();
  const configXmlPath = path.join(configPath, appName.toLowerCase(), 'config', 'config.xml');
  let apiKey;

  try {
    const configXml = await fs.readFile(configXmlPath, 'utf8');
    const parsedXml = await parseStringPromise(configXml);
    apiKey = parsedXml?.Config?.ApiKey?.[0];
    if (!apiKey) {
      console.warn(`[waitForAppReady] Clé API introuvable dans config.xml de ${appName}`);
      return null;
    }
  } catch (err) {
    console.warn(`[waitForAppReady] config.xml inaccessible ou invalide pour ${appName}`);
    return null;
  }

  const url = `http://localhost:${port}/api/${apiVersion}/health`;

  while (Date.now() - start < timeout) {
    try {
      console.log(`[waitForAppReady] Tentative connexion à ${url}...`);
      const res = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
      console.log(`[waitForAppReady] Statut ${appName}: ${res.status}`);
      if (res.ok) return apiKey;
    } catch (err) {
      console.log(`[waitForAppReady] Erreur connexion ${appName}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, interval));
  }

  console.warn(`[waitForAppReady] Timeout pour ${appName}`);
  return null;
}

async function addAppToProwlarr({ appName, appUrl, appApiKey, configPath }) {
  const configXmlPath = path.join(configPath, 'prowlarr', 'config', 'config.xml');

  const prowlarrApiKey = await waitForAppReady({
    appName: 'Prowlarr',
    port: 9696,
    configPath,
    apiVersion: 'v1',
    timeout: 30000,
  });

  if (!prowlarrApiKey) {
    console.warn(`[addAppToProwlarr] Prowlarr pas prêt ou clé API introuvable`);
    return;
  }

  try {
    const response = await fetch('http://localhost:9696/api/v1/applications', {
      method: 'POST',
      headers: {
        'X-Api-Key': prowlarrApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: appName,
        implementation: appName,
        configContract: `${appName}Settings`,
        fields: [
          { name: 'useSsl', value: false },
          { name: 'apiKey', value: appApiKey },
          { name: 'baseUrl', value: appUrl },
          { name: 'prowlarrUrl', value: 'http://prowlarr:9696' }
        ],
        enable: true,
        syncLevel: 'fullSync'
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.warn(`Erreur ajout ${appName} à Prowlarr (${response.status}):`, result);
    } else {
      console.log(`${appName} ajouté avec succès à Prowlarr`);
    }
  } catch (err) {
    console.error(`Erreur ajout ${appName} à Prowlarr:`, err.message);
  }
}

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

    //
    // RADARR
    //
    const radarrConfigXml = await waitForConfigXml('radarr', projectDir);
    let radarrApiKey = null;

    if (radarrConfigXml) {
      radarrApiKey = await waitForAppReady({
        appName: 'Radarr',
        port: 7878,
        configPath: projectDir,
        apiVersion: 'v3',
      });

      if (radarrApiKey) {
        console.log(`[handler] Clé API Radarr récupérée: ${radarrApiKey}`);
      } else {
        console.warn(`[handler] Radarr lancé mais clé API introuvable`);
      }
    } else {
      console.warn(`[handler] config.xml de Radarr introuvable après timeout`);
    }

    //
    // PROWLARR
    //
    if (radarrApiKey) {
      const prowlarrConfigXml = await waitForConfigXml('prowlarr', projectDir);
      if (prowlarrConfigXml) {
        await addAppToProwlarr({
          appName: 'Radarr',
          appUrl: 'http://radarr:7878',
          appApiKey: radarrApiKey,
          configPath: projectDir,
        });
      } else {
        console.warn(`[handler] config.xml de Prowlarr introuvable`);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[handler] Erreur:', err);
    return res.status(500).json({ error: 'Erreur pendant le déploiement', details: err.message });
  }
}
