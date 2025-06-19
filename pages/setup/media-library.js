// pages/setup/media-library.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import ContainerSelector from '../../components/ContainerSelector';
import FileExplorer from '../../components/FileExplorer';
import { containers } from '../../data/containers';
import LoadingBar from '../../components/LoadingBar';
import yaml from 'js-yaml';



function mergeComposeWithServicePriority(existingContent, generatedContent) {
  const existing = yaml.load(existingContent) || {};
  const generated = yaml.load(generatedContent) || {};

  const merged = {
    ...generated,
    ...existing, // priorité au contenu existant (hors `services`)
    services: {
      ...generated.services,
      ...existing.services, // priorité aux services existants
    },
  };

  return yaml.dump(merged);
}




export default function MediaLibrarySetup() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [selection, setSelection] = useState({});
  const [dockerCompose, setDockerCompose] = useState(null);
  const [loading, setLoading] = useState(false);

  const [dockerAvailable, setDockerAvailable] = useState(null);
  const [configPath, setConfigPath] = useState('');
  const [error, setError] = useState(null);

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState(null);
  const [projectName, setProjectName] = useState('medialibrary');

  const [detectedComposePath, setDetectedComposePath] = useState(null);
  const [detectedComposeContent, setDetectedComposeContent] = useState('');
  const [mergeEnabled, setMergeEnabled] = useState(false);


  const [deployMethod, setDeployMethod] = useState('none');

  useEffect(() => {
    async function findComposeFile() {
      if (!configPath) return;

      const medialibraryPath = `${configPath.replace(/\/$/, '')}/medialibrary`;

      try {
        const res = await fetch('/api/files/list-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: medialibraryPath }),
        });

        if (!res.ok) return;

        const { files } = await res.json();
        const composeCandidate = files.find(name =>
          /^docker-compose.*\.ya?ml$/.test(name)
        );

        if (composeCandidate) {
          const fullPath = `${medialibraryPath}/${composeCandidate}`;
          const fileRes = await fetch('/api/files/read-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: fullPath }),
          });

          if (fileRes.ok) {
            const { content } = await fileRes.json();
            setDetectedComposeContent(content);
            setDetectedComposePath(fullPath);
          }
        }
      } catch (err) {
        console.warn('Erreur lecture docker-compose dans medialibrary:', err.message);
      }
    }

    findComposeFile();
  }, [configPath]);

  const [dockerComposeGenerated, setDockerComposeGenerated] = useState(null);

  async function generateDockerCompose() {
    setLoading(true);
    setError(null);
    try {
      const groupedSelection = { medialibrary: selection };

      const res = await fetch('/api/generate-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selection: groupedSelection }),
      });

      if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
      const data = await res.json();

      setDockerComposeGenerated(data.dockerCompose);

      // Si fusion activée, fusionne, sinon juste la génération brute
      if (mergeEnabled && detectedComposeContent) {
        try {
          const merged = mergeComposeWithServicePriority(detectedComposeContent, data.dockerCompose);
          setDockerCompose(merged);
        } catch (mergeErr) {
          console.error('Erreur fusion YAML:', mergeErr);
          setError('Erreur lors de la fusion des fichiers docker-compose.');
          setDockerCompose(data.dockerCompose);
        }
      } else {
        setDockerCompose(data.dockerCompose);
      }
    } catch (err) {
      setError("Erreur lors de la génération du docker-compose.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // React to merge toggle change
  useEffect(() => {
    if (!dockerComposeGenerated) return;

    if (mergeEnabled && detectedComposeContent) {
      try {
        const merged = mergeComposeWithServicePriority(detectedComposeContent, dockerComposeGenerated);
        setDockerCompose(merged);
      } catch (mergeErr) {
        console.error('Erreur fusion YAML:', mergeErr);
        setError('Erreur lors de la fusion des fichiers docker-compose.');
        setDockerCompose(dockerComposeGenerated);
      }
    } else {
      setDockerCompose(dockerComposeGenerated);
    }
  }, [mergeEnabled, detectedComposeContent]);


  async function handleDeploy() {
    if (!configPath) {
      setError('Veuillez indiquer un chemin valide pour les fichiers de configuration');
      return;
    }

    setError(null);
    setIsDeploying(true);
    setDeployLogs(null);

    try {
      const response = await fetch('/api/deploy/local-medialibrary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dockerCompose,
          configPath,
          projectName,
          merge: mergeEnabled,   // <-- Ajout ici
        }),
      });

      if (!response.ok) {
        const resultText = await response.text();
        throw new Error(`Erreur API: ${response.status} - ${resultText}`);
      }

      const result = await response.json();
      setDeployLogs({
        status: 'Succès',
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      });
    } catch (err) {
      setDeployLogs({
        status: 'Erreur',
        stdout: '',
        stderr: err.message,
      });
    } finally {
      setIsDeploying(false);
    }
  }


  function handleNext() {
    if (step === 1 && !dockerCompose) {
      alert('Merci de générer le docker-compose avant de continuer');
      return;
    }
    setError(null);
    setStep(step + 1);
  }

  function handlePrev() {
    setError(null);
    setStep(step - 1);
  }


  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => router.push('/')} style={{ marginBottom: '1rem' }}>← Page d'accueil</button>
      <h1>Configuration MediaLibrary</h1>

      {step === 1 && (
        <>
          <h2>1. Sélection des containers</h2>
          <ContainerSelector
            containers={containers.medialibrary}
            onSelectionChange={setSelection}
          />
          <button
            onClick={generateDockerCompose}
            disabled={loading}
            style={{ marginTop: 20 }}
          >
            {loading ? 'Génération...' : 'Générer docker-compose'}
          </button>
          {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
        </>
      )}

      {step === 2 && (
        <>
          <h2>2. Aperçu et déploiement</h2>
          {dockerCompose ? (
            <pre
              style={{
                marginTop: 20,
                backgroundColor: '#f0f0f0',
                padding: 10,
                maxHeight: 300,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {dockerCompose}
            </pre>
          ) : (
            <p>Aucun docker-compose généré. Retournez à l'étape 1.</p>
          )}

          <div style={{ marginTop: 20 }}>
            <label>Dossier de sauvegarde des configs :</label>
            <div style={{ marginTop: 6, marginBottom: 10, color: 'orange', fontStyle: 'italic' }}>
              Le dossier <strong>{projectName}</strong> sera automatiquement créé (et écrasé s’il existe déjà).
            </div>
            <FileExplorer basePath="/" onSelect={setConfigPath} />
            <div style={{ marginTop: 8, fontStyle: 'italic' }}>Sélectionné : {configPath}</div>

            {detectedComposeContent && (
              <div style={{ marginTop: 20, padding: 10, backgroundColor: '#fefbe8', border: '1px solid #e5c07b' }}>
                <strong>Fichier docker-compose détecté dans le dossier :</strong>
                <div style={{ fontFamily: 'monospace', marginTop: 4 }}>{detectedComposePath}</div>

                <label style={{ marginTop: 10, display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={mergeEnabled}
                    onChange={(e) => setMergeEnabled(e.target.checked)}
                  /> Fusionner ce fichier avec celui généré
                </label>
              </div>
            )}

            {error && <div style={{ color: 'red' }}>{error}</div>}
          </div>

          <fieldset style={{ marginTop: 20, marginBottom: '1rem' }}>
            <legend>Méthode de déploiement :</legend>
            <label style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="radio"
                name="deployMethod"
                value="none"
                checked={deployMethod === 'none'}
                onChange={(e) => setDeployMethod(e.target.value)}
              /> Juste générer le fichier
            </label>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                opacity: dockerAvailable === false ? 0.5 : 1,
              }}
            >
              <input
                type="radio"
                name="deployMethod"
                value="local"
                disabled={dockerAvailable === false}
                checked={deployMethod === 'local'}
                onChange={(e) => setDeployMethod(e.target.value)}
              />
              Déployer localement
              {dockerAvailable === false && (
                <div style={{ color: 'red', fontSize: '0.9em', marginTop: 4 }}>
                  Docker non disponible localement (pas de permission sur le socket)
                </div>
              )}
            </label>
          </fieldset>

          <button
            onClick={handleDeploy}
            disabled={
              !dockerCompose ||
              (deployMethod === 'local' && dockerAvailable === false) ||
              isDeploying ||
              deployMethod !== 'local' // ou selon ce que tu veux autoriser
            }
            style={{ marginTop: 20 }}
          >
            {isDeploying ? 'Déploiement en cours...' : 'Déployer localement'}
            {isDeploying && <LoadingBar />}
          </button>
        </>
      )}

      <div style={{ marginTop: 30 }}>
        {step > 1 && (
          <button onClick={handlePrev} style={{ marginRight: 10 }}>
            Précédent
          </button>
        )}
        {step < 2 && (
          <button onClick={handleNext}>Suivant</button>
        )}
      </div>

      {deployLogs && (
        <div
          style={{
            marginTop: 20,
            background: '#111',
            color: '#0f0',
            padding: 10,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
          }}
        >
          <strong>{deployLogs.status}</strong>
          <pre style={{ color: '#ccc' }}>{deployLogs.stdout}</pre>
          {deployLogs.stderr && <pre style={{ color: 'orange' }}>{deployLogs.stderr}</pre>}
        </div>
      )}
    </div>
  );
}
