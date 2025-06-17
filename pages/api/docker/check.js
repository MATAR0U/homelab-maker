import { exec } from 'child_process';

export default async function handler(req, res) {
  exec('docker info', (error, stdout, stderr) => {
    if (error) {
      return res.status(200).json({
        available: false,
        error: stderr || error.message,
      });
    }

    return res.status(200).json({
      available: true,
    });
  });
}
