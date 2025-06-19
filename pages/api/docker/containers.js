// pages/api/docker/containers.js
import { exec } from 'child_process';

export default async function handler(req, res) {
  exec('docker ps --format "{{json .}}"', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || error.message });
    }

    const containers = stdout
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => JSON.parse(line));

    res.status(200).json({ containers });
  });
}
