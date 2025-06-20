import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { parseStringPromise } from 'xml2js';
import fetch from 'node-fetch';

const execAsync = promisify(exec);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const APPS = {
  radarr: { port: 7878, apiVersion: 'v3' },
  prowlarr: { port: 9696, apiVersion: 'v1' },
};

export const config = {
  api: {
    bodyParser: true,
  },
};

// Fonction utilitaire pour écrire en flux
const streamLog = (res, msg) => {
  res.write(msg + '\n');
};

async function waitForConfigXml(appName, configPath, timeout = 60000, interval = 3000) {
  const configXmlPath = path.join(configPath, appName.toLowerCase(), 'config', 'config.xml');
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await fs.access(configXmlPath);
      return configXmlPath;
    } catch {
      await sleep(interval);
    }
  }
  return null;
}

async function waitForAppReady({ appName, port, configPath, apiVersion, timeout = 60000, interval = 3000 }) {
  const configXmlPath = path.join(configPath, appName.toLowerCase(), 'config', 'config.xml');
  let apiKey;

  try {
    const configXml = await fs.readFile(configXmlPath, 'utf8');
    const parsedXml = await parseStringPromise(configXml);
    apiKey = parsedXml?.Config?.ApiKey?.[0];
    if (!apiKey) return null;
  } catch {
    return null;
  }

  const url = `http://localhost:${port}/api/${apiVersion}/health`;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
      if (res.ok) return apiKey;
    } catch {}
    await sleep(interval);
  }

  return null;
}

async function addAppToProwlarr({ appName, appUrl, appApiKey, configPath }) {
  const prowlarrApiKey = await waitForAppReady({
    appName: 'Prowlarr',
    port: APPS.prowlarr.port,
    configPath,
    apiVersion: APPS.prowlarr.apiVersion,
    timeout: 30000,
  });

  if (!prowlarrApiKey) return;

  try {
    await fetch(`http://localhost:${APPS.prowlarr.port}/api/v1/applications`, {
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
          { name: 'prowlarrUrl', value: 'http://prowlarr:9696' },
        ],
        enable: true,
        syncLevel: 'fullSync',
      }),
    });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Méthode non autorisée');
    return;
  }

  const { configPath, projectName, dockerCompose, merge, selection = {} } = req.body;

  if (!configPath || !dockerCompose || !projectName) {
    res.status(400).end('Paramètres manquants');
    return;
  }

  // Prépare réponse en streaming
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
  });

  const projectDir = path.join(configPath, projectName);
  const composeFilePath = path.join(projectDir, 'docker-compose.generated.yml');
  const projectFlag = `-p ${projectName}`;

  try {
    streamLog(res, `Démarrage du déploiement pour ${projectName}`);

    // Nettoyage si nécessaire
    if (!merge) {
      try {
        await fs.rm(projectDir, { recursive: true, force: true });
        streamLog(res, `Dossier ${projectDir} supprimé`);
      } catch {}
    } else {
      streamLog(res, `Mode fusion activé (aucune suppression)`);
    }

    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(composeFilePath, dockerCompose, 'utf8');
    streamLog(res, `Fichier docker-compose généré`);

    const dockerComposeCmd = await execAsync('which docker compose')
      .then(() => 'docker compose')
      .catch(() => 'docker-compose');

    await execAsync(`${dockerComposeCmd} -f ${composeFilePath} config`);
    await execAsync(`${dockerComposeCmd} ${projectFlag} -f ${composeFilePath} up -d`, { cwd: projectDir });
    streamLog(res, `Conteneurs Docker démarrés`);

    // Liste les ports exposés
    try {
      const { stdout: psOutput } = await execAsync(`${dockerComposeCmd} ${projectFlag} -f ${composeFilePath} ps`);
      const lines = psOutput
        .split('\n')
        .filter(line => line.includes('0.0.0.0') || line.includes('127.0.0.1'));

      const portsInfo = lines.map(line => {
        const parts = line.trim().split(/\s{2,}/);
        const name = parts[0];
        const portMatch = parts.find(p => p.includes('->')) || '';
        return `- ${name} : ${portMatch}`;
      }).join('\n');

      streamLog(res, `Ports exposés:\n${portsInfo}`);
    } catch {
      streamLog(res, `Impossible d’obtenir les ports exposés`);
    }

    // Traitement Radarr
    if (selection.radarr) {
      streamLog(res, `Attente du démarrage de Radarr...`);
      const radarrConfigXml = await waitForConfigXml('radarr', projectDir);
      if (radarrConfigXml) {
        const radarrApiKey = await waitForAppReady({
          appName: 'Radarr',
          port: APPS.radarr.port,
          configPath: projectDir,
          apiVersion: APPS.radarr.apiVersion,
        });

        if (radarrApiKey) {
          streamLog(res, `Clé API Radarr récupérée`);

          if (selection.prowlarr) {
            streamLog(res, `Ajout de Radarr à Prowlarr...`);
            const prowlarrConfigXml = await waitForConfigXml('prowlarr', projectDir);
            if (prowlarrConfigXml) {
              await addAppToProwlarr({
                appName: 'Radarr',
                appUrl: 'http://radarr:7878',
                appApiKey: radarrApiKey,
                configPath: projectDir,
              });
              streamLog(res, `Radarr ajouté à Prowlarr`);
            } else {
              streamLog(res, `Fichier config.xml de Prowlarr introuvable`);
            }
          }
        } else {
          streamLog(res, `Clé API Radarr non récupérée`);
        }
      } else {
        streamLog(res, `config.xml de Radarr introuvable`);
      }
    }

    streamLog(res, `Déploiement terminé.`);
    res.end();
  } catch (err) {
    streamLog(res, `Erreur : ${err.message}`);
    res.end();
  }
}
