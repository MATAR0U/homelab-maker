// components/LoadingBar.js
export default function LoadingBar() {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        width: '100%',
        height: 10,
        backgroundColor: '#e0e0e0',
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, #4caf50 0%, #81c784 50%, #4caf50 100%)',
          animation: 'progressAnimation 2s infinite linear',
          backgroundSize: '200% 100%',
        }} />
      </div>

      <style jsx>{`
        @keyframes progressAnimation {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}
