interface Props {
  isThinking: boolean
  isTraining: boolean
  indexedDocuments: number
  totalChunks: number
  statusLabel: string
}

export function NeuralCore({
  isThinking,
  isTraining,
  indexedDocuments,
  totalChunks,
  statusLabel
}: Props) {
  const modeClass = isTraining ? 'is-training' : isThinking ? 'is-thinking' : 'is-idle'

  return (
    <div className={`neural-core ${modeClass}`}>
      <div className="neural-core__atmosphere" />
      <div className="neural-core__glow" />

      <div className="neural-core__layer neural-core__layer--outer">
        <svg viewBox="0 0 600 600" className="neural-core__svg" aria-hidden="true">
          <circle cx="300" cy="300" r="228" className="neural-core__stroke neural-core__stroke--soft" />
          <ellipse cx="300" cy="300" rx="228" ry="108" className="neural-core__stroke neural-core__stroke--fade" />
          <ellipse cx="300" cy="300" rx="168" ry="228" className="neural-core__stroke neural-core__stroke--fade" />
          <path
            d="M110 300c35-78 110-134 190-134s155 56 190 134"
            className="neural-core__stroke neural-core__stroke--accent"
          />
          <path
            d="M110 300c35 78 110 134 190 134s155-56 190-134"
            className="neural-core__stroke neural-core__stroke--soft"
          />
        </svg>
      </div>

      <div className="neural-core__layer neural-core__layer--middle">
        <svg viewBox="0 0 600 600" className="neural-core__svg" aria-hidden="true">
          <circle cx="300" cy="300" r="176" className="neural-core__stroke neural-core__stroke--accent" />
          <circle cx="300" cy="300" r="146" className="neural-core__stroke neural-core__stroke--fade" />
          <ellipse cx="300" cy="300" rx="176" ry="84" className="neural-core__stroke neural-core__stroke--soft" />
          <ellipse cx="300" cy="300" rx="132" ry="176" className="neural-core__stroke neural-core__stroke--soft" />
          <path
            d="M176 206c48-34 87-45 124-45 38 0 77 11 124 45"
            className="neural-core__stroke neural-core__stroke--accent"
          />
          <path
            d="M176 394c48 34 87 45 124 45 38 0 77-11 124-45"
            className="neural-core__stroke neural-core__stroke--fade"
          />
        </svg>
      </div>

      <div className="neural-core__brain">
        <svg viewBox="0 0 600 600" className="neural-core__svg" aria-hidden="true">
          <defs>
            <radialGradient id="brain-core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,236,191,0.95)" />
              <stop offset="40%" stopColor="rgba(255,188,82,0.55)" />
              <stop offset="100%" stopColor="rgba(255,188,82,0)" />
            </radialGradient>
          </defs>

          <ellipse cx="300" cy="300" rx="98" ry="84" fill="url(#brain-core-glow)" opacity="0.95" />

          <path
            d="M251 223c-43 6-73 44-73 89 0 52 38 92 90 92 17 0 32-5 45-12"
            className="neural-core__stroke neural-core__stroke--accent neural-core__stroke--thick"
          />
          <path
            d="M349 223c43 6 73 44 73 89 0 52-38 92-90 92-17 0-32-5-45-12"
            className="neural-core__stroke neural-core__stroke--accent neural-core__stroke--thick"
          />
          <path
            d="M230 252c20-16 41-24 62-24 22 0 43 8 60 24"
            className="neural-core__stroke neural-core__stroke--soft"
          />
          <path
            d="M228 296c19-13 41-20 64-20 22 0 44 7 62 20"
            className="neural-core__stroke neural-core__stroke--soft"
          />
          <path
            d="M227 340c20-14 42-21 65-21 21 0 44 7 61 21"
            className="neural-core__stroke neural-core__stroke--soft"
          />
          <path
            d="M262 214c15 18 24 38 24 61 0 17-4 34-11 48"
            className="neural-core__stroke neural-core__stroke--fade"
          />
          <path
            d="M338 214c-15 18-24 38-24 61 0 17 4 34 11 48"
            className="neural-core__stroke neural-core__stroke--fade"
          />
          <path
            d="M300 220v162"
            className="neural-core__stroke neural-core__stroke--accent"
          />
          <path
            d="M300 382c0 27-7 48-21 67"
            className="neural-core__stroke neural-core__stroke--fade"
          />

          <circle cx="232" cy="252" r="3.5" className="neural-core__node" />
          <circle cx="268" cy="216" r="3.5" className="neural-core__node" />
          <circle cx="369" cy="255" r="3.5" className="neural-core__node" />
          <circle cx="330" cy="214" r="3.5" className="neural-core__node" />
          <circle cx="231" cy="340" r="3.5" className="neural-core__node" />
          <circle cx="369" cy="340" r="3.5" className="neural-core__node" />
          <circle cx="300" cy="382" r="4.2" className="neural-core__node neural-core__node--strong" />
        </svg>
      </div>

      <div className="neural-core__layer neural-core__layer--scan">
        <svg viewBox="0 0 600 600" className="neural-core__svg" aria-hidden="true">
          <path
            d="M76 300c68-132 192-212 224-212 33 0 156 80 224 212"
            className="neural-core__stroke neural-core__stroke--fade"
          />
          <path
            d="M76 300c68 132 192 212 224 212 33 0 156-80 224-212"
            className="neural-core__stroke neural-core__stroke--accent"
          />
        </svg>
      </div>

      <div className="neural-core__spark neural-core__spark--one" />
      <div className="neural-core__spark neural-core__spark--two" />
      <div className="neural-core__spark neural-core__spark--three" />
      <div className="neural-core__spark neural-core__spark--four" />

      <div className="neural-core__status-panel">
        <span className="neural-core__status-label">core state</span>
        <strong className="neural-core__status-value">{statusLabel}</strong>
      </div>

      <div className="neural-core__stat neural-core__stat--left">
        <span className="neural-core__stat-value">{indexedDocuments}</span>
        <span className="neural-core__stat-label">documentos</span>
      </div>

      <div className="neural-core__stat neural-core__stat--right">
        <span className="neural-core__stat-value">{totalChunks}</span>
        <span className="neural-core__stat-label">chunks</span>
      </div>
    </div>
  )
}
