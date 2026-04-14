interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large'
  color?: string
  text?: string
}

export function LoadingSpinner({ size = 'medium', color = 'var(--accent)', text }: LoadingSpinnerProps) {
  const sizeMap = {
    small: '16px',
    medium: '24px',
    large: '32px'
  }

  const spinnerSize = sizeMap[size]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
      <div
        style={{
          width: spinnerSize,
          height: spinnerSize,
          border: `3px solid rgba(0, 0, 0, 0.1)`,
          borderTop: `3px solid ${color}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto'
        }}
      />
      {text && (
        <span style={{ fontSize: size === 'small' ? '12px' : '14px', color: 'var(--text)' }}>
          {text}
        </span>
      )}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
