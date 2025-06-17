import { useState, useEffect } from 'react';

export default function FileExplorer({ basePath = '/', onSelect }) {
  const [currentPath, setCurrentPath] = useState(basePath);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);

  async function fetchFiles(path) {
    setError(null);
    try {
      const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files);
        setCurrentPath(data.path);
      } else {
        setError(data.error || 'Erreur inconnue');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    fetchFiles(currentPath);
  }, []);

  function goUp() {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    fetchFiles(parentPath);
  }

  function enterDir(name) {
    const newPath = currentPath.endsWith('/') ? currentPath + name : currentPath + '/' + name;
    fetchFiles(newPath);
  }

  return (
    <div style={{ border: '1px solid #ccc', padding: 10, maxWidth: 400 }}>
      <div style={{ marginBottom: 10 }}>
        <button onClick={goUp} disabled={currentPath === '/' || currentPath === ''}>⬆️ Remonter</button>
      </div>
      <div style={{ fontSize: 12, marginBottom: 10 }}>Chemin: {currentPath}</div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <ul style={{ listStyle: 'none', paddingLeft: 0, maxHeight: 200, overflowY: 'auto' }}>
        {files.map(file => (
          <li key={file.name} style={{ cursor: file.isDirectory ? 'pointer' : 'default', color: file.isDirectory ? 'blue' : 'black' }}
            onClick={() => file.isDirectory && enterDir(file.name)}>
            {file.isDirectory ? '📁' : '📄'} {file.name}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(currentPath)}
        disabled={error !== null}
        style={{ marginTop: 10 }}
      >
        Sélectionner ce dossier
      </button>
    </div>
  );
}
