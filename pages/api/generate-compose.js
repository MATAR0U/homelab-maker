import YAML from 'yaml';
import { containers } from '../../data/containers';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { selection } = req.body;
  if (!selection) return res.status(400).json({ error: 'Sélection manquante' });

  const compose = { services: {} };

  for (const [category, containerGroup] of Object.entries(selection)) {
    const containerList = containers[category] || [];

    for (const [containerId, params] of Object.entries(containerGroup)) {
      const containerDef = containerList.find(c => c.id === containerId);
      if (!containerDef) continue;

      const service = {
        image: containerDef.image,
        environment: {},
        ports: containerDef.ports || [],
        volumes: containerDef.volumes || [],
        restart: containerDef.restart || 'unless-stopped',
      };

      // Ajout des variables d'environnement
      if (Array.isArray(containerDef.parameters)) {
        for (const param of containerDef.parameters) {
          if (params[param.name]) {
            service.environment[param.name] = params[param.name];
          }
        }
      }

      // Nettoyage des champs vides
      for (const key in service) {
        if (
          (typeof service[key] === 'object' && Object.keys(service[key]).length === 0) ||
          (Array.isArray(service[key]) && service[key].length === 0)
        ) {
          delete service[key];
        }
      }

      compose.services[containerId] = service;
    }
  }

  const yaml = YAML.stringify(compose);
  res.status(200).json({ dockerCompose: yaml });
}
