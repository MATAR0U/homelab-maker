import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

export async function generateConfig(containerId) {
  // Génère une clé API aléatoire
  const apiKey = crypto.randomBytes(16).toString('hex');

  // Charge le template XML correspondant
  const templatePath = path.join(TEMPLATES_DIR, containerId, 'config.xml');
  let template = await fs.readFile(templatePath, 'utf8');

  // Remplace le placeholder par la clé API
  const configContent = template.replace('{{API_KEY}}', apiKey);

  return { apiKey, configContent };
}
