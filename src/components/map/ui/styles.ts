// File: src/components/map/ui/styles.ts
export const darkButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #444',
  background: '#2c2c2e',
  fontSize: 13,
  cursor: 'pointer',
  color: '#fff',
};

export const floatingPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 50,
  right: 10,
  zIndex: 1099,
  backgroundColor: '#222',
  padding: 12,
  borderRadius: 12,
  boxShadow: '0 0 12px #000',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: 190,
  color: 'white',
  userSelect: 'none',
  maxHeight: 'calc(100vh - 70px)',
  overflowY: 'auto',
};
