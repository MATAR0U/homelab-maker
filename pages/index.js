// pages/index.js
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  function goTo(category) {
    router.push(`/setup/${category}`);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Homelab Maker</h1>
      <h2>Choisissez une catégorie à configurer :</h2>

      <div style={{ marginTop: 30 }}>
        <button style={btnStyle} onClick={() => goTo('media-library')}>
          📁 MediaLibrary
        </button>
        <button style={btnStyle} onClick={() => goTo('dashboard')}>
          🖥️ Dashboard
        </button>
      </div>
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
