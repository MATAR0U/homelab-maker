import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function goTo(category) {
    router.push(`/setup/${category}`);
  }

  useEffect(() => {
    fetch('/api/docker/containers')
      .then(res => res.json())
      .then(data => {
        setContainers(data.containers || []);
        setLoading(false);
      })
      .catch(err => {
        setError("Impossible de récupérer les conteneurs Docker");
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Homelab Maker</h1>
      <h2>Choisissez une catégorie à configurer :</h2>

      <div style={{ marginTop: 30 }}>
        <button style={btnStyle} onClick={() => goTo('media-library')}>
          🎞️ MediaLibrary
        </button>
        <button style={btnStyle} onClick={() => goTo('dashboard')}>
          🖥️ Dashboard
        </button>
      </div>

      <hr style={{ margin: '2rem 0' }} />

      <h2>🐳 Conteneurs en cours d'exécution :</h2>

      {loading && <p>Chargement des conteneurs...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {containers.length > 0 ? (
        <ul style={{ marginTop: 20 }}>
          {containers.map((c, i) => (
            <li key={i} style={containerStyle}>
              <strong>{c.Names}</strong> <br />
              Image : {c.Image} <br />
              Statut : {c.Status}
            </li>
          ))}
        </ul>
      ) : (
        !loading && <p>Aucun conteneur actif</p>
      )}
    </div>
  );
}

const btnStyle = {
  display: 'block',
  margin: '1rem 0',
  padding: '1rem 2rem',
  fontSize: '1.2rem',
  cursor: 'pointer',
};

const containerStyle = {
  marginBottom: '1rem',
  padding: '1rem',
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};
