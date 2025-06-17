import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const TEMPLATE_PATH = path.join(process.cwd(), 'config-templates', 'config-radarr-template.xml');
const OUTPUT_DIR = path.join(process.cwd(), 'generated-configs', 'radarr');
const OUTPUT_CONFIG_PATH = path.join(OUTPUT_DIR, 'config.xml');

export async function generateApiKey() {
  return crypto.randomBytes(16).toString('hex'); // 32 chars hex
}

export async function generateRadarrConfig() {
  // Génère la clé API
  const apiKey = await generateApiKey();

  // Lit le template
  let template = await fs.readFile(TEMPLATE_PATH, 'utf-8');

  // Remplace {{API_KEY}} par la clé
  template = template.replace('{{API_KEY}}', apiKey);

  // Crée le dossier s'il n'existe pas
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Écrit le fichier config.xml
  await fs.writeFile(OUTPUT_CONFIG_PATH, template, 'utf-8');

  return {
    apiKey,
    configPath: OUTPUT_CONFIG_PATH,
    outputDir: OUTPUT_DIR,
  };
}
