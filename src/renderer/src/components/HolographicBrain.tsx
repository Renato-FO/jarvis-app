import { useEffect, useRef } from 'react'

interface Props {
  isThinking: boolean
  isTraining: boolean
  indexedDocuments: number
  totalChunks: number
  statusLabel: string
}

interface OrbitalPoint {
  radius: number
  theta: number
  phi: number
  size: number
  alpha: number
}

interface Pulse {
  radius: number
  angle: number
  speed: number
  tilt: number
}

interface Connection {
  innerAngle: number
  outerAngle: number
  outerRadius: number
}

function projectPoint(radius: number, theta: number, phi: number, rotation: number) {
  const x3 = radius * Math.sin(phi) * Math.cos(theta + rotation)
  const y3 = radius * Math.cos(phi)
  const z3 = radius * Math.sin(phi) * Math.sin(theta + rotation)
  const perspective = 1 + z3 / (radius * 4)

  return {
    x: x3 * perspective,
    y: y3 * perspective,
    alpha: Math.max(0.1, 0.65 + z3 / (radius * 3.4))
  }
}

export function HolographicBrain({
  isThinking,
  isTraining,
  indexedDocuments,
  totalChunks,
  statusLabel
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const speedRef = useRef(0.5)

  useEffect(() => {
    speedRef.current = isThinking ? 1.8 : isTraining ? 1.2 : 0.5
  }, [isThinking, isTraining])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return

    const context = canvas.getContext('2d')
    if (!context) return

    let animationFrame = 0
    let width = 0
    let height = 0
    let size = 0
    let outerPoints: OrbitalPoint[] = []
    let innerPoints: OrbitalPoint[] = []
    let pulses: Pulse[] = []
    let connections: Connection[] = []

    const resize = () => {
      const bounds = stage.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = bounds.width
      height = bounds.height
      size = Math.min(width, height)

      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      outerPoints = Array.from({ length: 1500 }, (_, index) => ({
        radius: size * (0.28 + (index % 7) * 0.005),
        theta: (index / 1500) * Math.PI * 2 * 13,
        phi: Math.acos(1 - (2 * (index + 1)) / 1501),
        size: 0.9 + (index % 3) * 0.35,
        alpha: 0.08 + ((index * 17) % 10) / 60
      }))

      innerPoints = Array.from({ length: 580 }, (_, index) => ({
        radius: size * (0.11 + (index % 5) * 0.003),
        theta: (index / 580) * Math.PI * 2 * 7,
        phi: Math.acos(1 - (2 * (index + 1)) / 581),
        size: 1.4 + (index % 4) * 0.4,
        alpha: 0.12 + ((index * 13) % 10) / 40
      }))

      pulses = Array.from({ length: 8 }, (_, index) => ({
        radius: size * (0.16 + (index % 4) * 0.03),
        angle: (index / 8) * Math.PI * 2,
        speed: 0.35 + (index % 3) * 0.14,
        tilt: index % 2 === 0 ? 0.45 : -0.45
      }))

      connections = Array.from({ length: 36 }, (_, index) => ({
        innerAngle: (index / 36) * Math.PI * 2,
        outerAngle: ((index * 19) % 36 / 36) * Math.PI * 2,
        outerRadius: size * (0.24 + (index % 4) * 0.04)
      }))
    }

    const drawBrainCurves = (time: number) => {
      const lobeOffset = size * 0.055
      const lobeWidth = size * 0.12
      const lobeHeight = size * 0.14
      const verticalPulse = Math.sin(time * 2.1) * size * 0.004

      context.save()
      context.strokeStyle = 'rgba(255, 186, 78, 0.86)'
      context.lineWidth = 1.4
      context.shadowBlur = 18
      context.shadowColor = 'rgba(255, 166, 58, 0.38)'

      const drawLobe = (direction: -1 | 1) => {
        const centerX = direction * lobeOffset
        context.beginPath()
        context.moveTo(centerX, -lobeHeight * 0.95)
        context.bezierCurveTo(
          centerX - direction * lobeWidth * 0.62,
          -lobeHeight * 0.92,
          centerX - direction * lobeWidth,
          -lobeHeight * 0.1,
          centerX - direction * lobeWidth * 0.82,
          lobeHeight * 0.58
        )
        context.bezierCurveTo(
          centerX - direction * lobeWidth * 0.35,
          lobeHeight * 1.04,
          centerX + direction * lobeWidth * 0.15,
          lobeHeight * 0.78,
          centerX + direction * lobeWidth * 0.08,
          lobeHeight * 0.2
        )
        context.bezierCurveTo(
          centerX + direction * lobeWidth * 0.2,
          -lobeHeight * 0.14,
          centerX + direction * lobeWidth * 0.18,
          -lobeHeight * 0.62,
          centerX,
          -lobeHeight * 0.95
        )
        context.stroke()

        for (let i = 0; i < 5; i++) {
          const wave = (i + 1) / 6
          context.beginPath()
          context.moveTo(centerX - direction * lobeWidth * 0.72, -lobeHeight * (0.55 - wave * 0.08))
          context.bezierCurveTo(
            centerX - direction * lobeWidth * 0.24,
            -lobeHeight * (0.8 - wave * 0.06),
            centerX - direction * lobeWidth * 0.04,
            -lobeHeight * (0.18 - wave * 0.08),
            centerX - direction * lobeWidth * 0.4,
            lobeHeight * (0.64 - wave * 0.07)
          )
          context.strokeStyle = `rgba(255, 199, 117, ${0.22 + wave * 0.12})`
          context.lineWidth = 0.9
          context.stroke()
        }
      }

      drawLobe(-1)
      drawLobe(1)

      context.beginPath()
      context.moveTo(0, -lobeHeight * 0.84)
      context.lineTo(0, lobeHeight * 0.86 + verticalPulse)
      context.strokeStyle = 'rgba(255, 208, 140, 0.36)'
      context.lineWidth = 1
      context.stroke()
      context.restore()
    }

    const draw = (timestamp: number) => {
      const speed = speedRef.current
      const time = timestamp * 0.001 * speed

      context.clearRect(0, 0, width, height)
      context.save()
      context.translate(width / 2, height / 2)

      const outerRadius = size * 0.33
      const midRadius = size * 0.26
      const innerRadius = size * 0.12

      const glow = context.createRadialGradient(0, 0, innerRadius * 0.08, 0, 0, outerRadius * 1.08)
      glow.addColorStop(0, 'rgba(255, 217, 143, 0.92)')
      glow.addColorStop(0.2, 'rgba(255, 180, 74, 0.28)')
      glow.addColorStop(0.55, 'rgba(255, 151, 43, 0.08)')
      glow.addColorStop(1, 'rgba(255, 151, 43, 0)')
      context.fillStyle = glow
      context.beginPath()
      context.arc(0, 0, outerRadius * 1.08, 0, Math.PI * 2)
      context.fill()

      context.strokeStyle = 'rgba(255, 190, 92, 0.28)'
      context.lineWidth = 1
      context.shadowBlur = 12
      context.shadowColor = 'rgba(255, 166, 58, 0.2)'

      context.save()
      context.rotate(time * 0.24)
      context.beginPath()
      context.arc(0, 0, outerRadius, 0, Math.PI * 2)
      context.stroke()
      context.restore()

      context.save()
      context.rotate(-time * 0.34)
      context.beginPath()
      context.ellipse(0, 0, outerRadius, outerRadius * 0.45, 0, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255, 177, 70, 0.24)'
      context.stroke()
      context.beginPath()
      context.ellipse(0, 0, outerRadius * 0.62, outerRadius, 0, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255, 177, 70, 0.16)'
      context.stroke()
      context.restore()

      context.save()
      context.rotate(time * 0.42)
      context.beginPath()
      context.arc(0, 0, midRadius, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255, 208, 133, 0.42)'
      context.stroke()
      context.beginPath()
      context.ellipse(0, 0, midRadius, midRadius * 0.48, 0, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255, 177, 70, 0.28)'
      context.stroke()
      context.restore()

      context.save()
      context.strokeStyle = 'rgba(255, 174, 58, 0.11)'
      context.lineWidth = 0.8
      connections.forEach((connection, index) => {
        const innerX = Math.cos(connection.innerAngle + time * 0.4) * innerRadius * 0.85
        const innerY = Math.sin(connection.innerAngle + time * 0.4) * innerRadius * 0.7
        const outerX = Math.cos(connection.outerAngle - time * 0.12) * connection.outerRadius
        const outerY = Math.sin(connection.outerAngle - time * 0.12) * connection.outerRadius * 0.68
        context.beginPath()
        context.moveTo(innerX, innerY)
        context.lineTo(outerX, outerY)
        context.globalAlpha = 0.16 + (index % 3) * 0.06
        context.stroke()
      })
      context.restore()

      context.save()
      outerPoints.forEach((point, index) => {
        const projected = projectPoint(point.radius, point.theta, point.phi, time * 0.12 + index * 0.00015)
        context.fillStyle = `rgba(255, 177, 70, ${point.alpha * projected.alpha})`
        context.beginPath()
        context.arc(projected.x, projected.y, point.size, 0, Math.PI * 2)
        context.fill()
      })
      context.restore()

      context.save()
      innerPoints.forEach((point, index) => {
        const projected = projectPoint(point.radius, point.theta, point.phi, -time * 0.26 + index * 0.0008)
        context.fillStyle = `rgba(255, 217, 148, ${point.alpha * projected.alpha})`
        context.beginPath()
        context.arc(projected.x, projected.y, point.size, 0, Math.PI * 2)
        context.fill()
      })
      context.restore()

      pulses.forEach((pulse) => {
        const angle = pulse.angle + time * pulse.speed
        const x = Math.cos(angle) * pulse.radius
        const y = Math.sin(angle * 1.7) * pulse.radius * pulse.tilt
        context.fillStyle = 'rgba(255, 233, 199, 0.94)'
        context.shadowBlur = 16
        context.shadowColor = 'rgba(255, 166, 58, 0.8)'
        context.beginPath()
        context.arc(x, y, 3.8, 0, Math.PI * 2)
        context.fill()
      })

      context.shadowBlur = 0
      drawBrainCurves(time)

      const coreGradient = context.createRadialGradient(0, 0, 0, 0, 0, innerRadius * 1.4)
      coreGradient.addColorStop(0, 'rgba(255, 234, 188, 0.96)')
      coreGradient.addColorStop(0.24, 'rgba(255, 192, 96, 0.4)')
      coreGradient.addColorStop(1, 'rgba(255, 192, 96, 0)')
      context.fillStyle = coreGradient
      context.beginPath()
      context.arc(0, 0, innerRadius * 1.35, 0, Math.PI * 2)
      context.fill()

      context.restore()
      animationFrame = window.requestAnimationFrame(draw)
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stage)
    animationFrame = window.requestAnimationFrame(draw)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <div className="holo-brain" ref={stageRef}>
      <canvas ref={canvasRef} className="holo-brain__canvas" />
      <div className="holo-brain__scanline" />

      <div className="holo-brain__status-panel">
        <span className="holo-brain__status-label">core state</span>
        <strong className="holo-brain__status-value">{statusLabel}</strong>
      </div>

      <div className="holo-brain__stat holo-brain__stat--left">
        <span className="holo-brain__stat-value">{indexedDocuments}</span>
        <span className="holo-brain__stat-label">documentos</span>
      </div>

      <div className="holo-brain__stat holo-brain__stat--right">
        <span className="holo-brain__stat-value">{totalChunks}</span>
        <span className="holo-brain__stat-label">chunks</span>
      </div>
    </div>
  )
}
