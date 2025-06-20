import { useEffect, useState } from 'react';
import ContainerSelector from '../../components/ContainerSelector';
import FileExplorer from '../../components/FileExplorer';
import { containers } from '../../data/containers';

export default function Dashboard() {
  const [step, setStep] = useState(1);
  const [selection, setSelection] = useState({});
  const [dockerCompose, setDockerCompose] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState(null);
  const [configPath, setConfigPath] = useState('');
  const [error, setError] = useState(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState(null);
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    fetch('/api/docker/check')
      .then(res => res.json())
      .then(data => setDockerAvailable(data.available))
      .catch(() => setDockerAvailable(false));
  }, []);

  async function generateDockerCompose() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selection }),
      });
      if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
      const data = await res.json();
      setDockerCompose(data.dockerCompose);
    } catch (error) {
      setError('Erreur lors de la génération du docker-compose.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeploy() {
    if (!configPath) {
      setError('Veuillez indiquer un chemin valide pour les fichiers de configuration');
      return;
    }
    setError(null);
    setIsDeploying(true);
    setDeployLogs(null);

    const categories = Object.keys(selection);
    const project = categories.length > 0 ? categories[0] : 'dashboard';
    setProjectName(project);

    try {
      const response = await fetch('/api/deploy/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: dockerCompose, configPath, projectName: project }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error: ${response.status} - ${text}`);
      }

      const result = await response.json();

      if (result.success) {
        setDeployLogs({
          status: 'Déploiement réussi',
          stdout: result.stdout,
          stderr: result.stderr,
        });
      } else {
        setDeployLogs({
          status: 'Erreur',
          stdout: '',
          stderr: result.error + '\n' + (result.details || ''),
        });
      }
    } catch (err) {
      setDeployLogs({
        status: 'Exception',
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
      <h1>Dashboard Tools</h1>

      {step === 1 && (
        <>
          <h2>1. Sélection des dashboards</h2>
          <ContainerSelector
                      containers={containers.dashboard}
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
            <FileExplorer basePath="/" onSelect={setConfigPath} />
            <div style={{ marginTop: 8, fontStyle: 'italic' }}>Sélectionné : {configPath}</div>
            {error && <div style={{ color: 'red' }}>{error}</div>}
          </div>

          <fieldset style={{ marginTop: 20, marginBottom: '1rem' }}>
            <legend>Méthode de déploiement :</legend>
            <label style={{ display: 'block', marginBottom: 6 }}>
              <input type="radio" name="deployMethod" value="none" defaultChecked /> Juste générer le fichier
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
              />{' '}
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
            disabled={!dockerAvailable || isDeploying}
            style={{ marginTop: 20 }}
          >
            {isDeploying ? 'Déploiement en cours...' : 'Déployer localement'}
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
          <button onClick={handleNext}>
            Suivant
          </button>
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
