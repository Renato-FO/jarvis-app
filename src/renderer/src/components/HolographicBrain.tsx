import type { CSSProperties } from 'react'
import { memo, useEffect, useRef } from 'react'

interface Props {
  isThinking: boolean
  isTraining: boolean
  indexedDocuments: number
  totalChunks: number
  statusLabel: string
  interactionCount: number
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

interface RingLayer {
  radiusX: number
  radiusY: number
  tilt: number
  lineWidth: number
  alpha: number
  rotationSpeed: number
  dash: number[]
}

type RGB = [number, number, number]

interface Palette {
  glowCore: RGB
  glowMid: RGB
  ringBright: RGB
  ringSoft: RGB
  particleHot: RGB
  particleSoft: RGB
  panelBorder: RGB
  panelText: RGB
}

const HOLO_PALETTES: Palette[] = [
  {
    glowCore: [120, 229, 255],
    glowMid: [44, 190, 255],
    ringBright: [187, 244, 255],
    ringSoft: [88, 206, 255],
    particleHot: [228, 251, 255],
    particleSoft: [124, 220, 255],
    panelBorder: [116, 220, 255],
    panelText: [224, 249, 255]
  },
  {
    glowCore: [255, 223, 160],
    glowMid: [255, 162, 74],
    ringBright: [255, 236, 194],
    ringSoft: [255, 186, 84],
    particleHot: [255, 245, 221],
    particleSoft: [255, 200, 128],
    panelBorder: [255, 186, 84],
    panelText: [255, 234, 188]
  },
  {
    glowCore: [167, 255, 214],
    glowMid: [50, 214, 159],
    ringBright: [218, 255, 236],
    ringSoft: [88, 234, 180],
    particleHot: [236, 255, 245],
    particleSoft: [137, 243, 203],
    panelBorder: [74, 228, 175],
    panelText: [225, 255, 240]
  },
  {
    glowCore: [255, 190, 167],
    glowMid: [255, 112, 92],
    ringBright: [255, 226, 214],
    ringSoft: [255, 143, 122],
    particleHot: [255, 242, 236],
    particleSoft: [255, 180, 165],
    panelBorder: [255, 138, 116],
    panelText: [255, 236, 228]
  },
  {
    glowCore: [204, 220, 255],
    glowMid: [122, 171, 255],
    ringBright: [231, 239, 255],
    ringSoft: [154, 190, 255],
    particleHot: [243, 247, 255],
    particleSoft: [183, 208, 255],
    panelBorder: [145, 184, 255],
    panelText: [236, 243, 255]
  }
]

const MAX_CANVAS_DPR = 1.35
const TARGET_FRAME_MS = 1000 / 45

function clonePalette(palette: Palette): Palette {
  return {
    glowCore: [...palette.glowCore] as RGB,
    glowMid: [...palette.glowMid] as RGB,
    ringBright: [...palette.ringBright] as RGB,
    ringSoft: [...palette.ringSoft] as RGB,
    particleHot: [...palette.particleHot] as RGB,
    particleSoft: [...palette.particleSoft] as RGB,
    panelBorder: [...palette.panelBorder] as RGB,
    panelText: [...palette.panelText] as RGB
  }
}

function easeRgb(current: RGB, target: RGB, amount: number): RGB {
  return current.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount)
  ) as RGB
}

function rgba(color: RGB, alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.max(0, Math.min(1, alpha))})`
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

export const HolographicBrain = memo(function HolographicBrain({
  isThinking,
  isTraining,
  indexedDocuments,
  totalChunks,
  statusLabel,
  interactionCount
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const basePalette = HOLO_PALETTES[0]
  const transientPalette =
    HOLO_PALETTES[((Math.max(interactionCount, 1) - 1) % (HOLO_PALETTES.length - 1)) + 1] ??
    HOLO_PALETTES[1]
  const isShiftActive = isThinking || isTraining
  const currentPaletteRef = useRef<Palette>(clonePalette(basePalette))
  const targetPaletteRef = useRef<Palette>(clonePalette(basePalette))

  useEffect(() => {
    targetPaletteRef.current = clonePalette(isShiftActive ? transientPalette : basePalette)
  }, [basePalette, transientPalette, isShiftActive])

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
    let ringLayers: RingLayer[] = []
    let lastDrawTime = 0

    const resize = () => {
      const bounds = stage.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR)
      width = bounds.width
      height = bounds.height
      size = Math.min(width, height)
      const densityFactor = (size >= 680 ? 1 : size >= 520 ? 0.82 : 0.68) * (dpr > 1.2 ? 0.9 : 1)

      const outerPointCount = Math.max(820, Math.round(1500 * densityFactor))
      const innerPointCount = Math.max(320, Math.round(620 * densityFactor))
      const pulseCount = Math.max(8, Math.round(10 * densityFactor))
      const connectionCount = Math.max(28, Math.round(44 * densityFactor))
      const ringCount = Math.max(6, Math.round(7 * densityFactor))

      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      outerPoints = Array.from({ length: outerPointCount }, (_, index) => ({
        radius: size * (0.28 + (index % 9) * 0.005),
        theta: (index / outerPointCount) * Math.PI * 2 * 13,
        phi: Math.acos(1 - (2 * (index + 1)) / (outerPointCount + 1)),
        size: 0.9 + (index % 3) * 0.35,
        alpha: 0.08 + ((index * 17) % 10) / 60
      }))

      innerPoints = Array.from({ length: innerPointCount }, (_, index) => ({
        radius: size * (0.11 + (index % 7) * 0.003),
        theta: (index / innerPointCount) * Math.PI * 2 * 7,
        phi: Math.acos(1 - (2 * (index + 1)) / (innerPointCount + 1)),
        size: 1.4 + (index % 4) * 0.4,
        alpha: 0.12 + ((index * 13) % 10) / 40
      }))

      pulses = Array.from({ length: pulseCount }, (_, index) => ({
        radius: size * (0.15 + (index % 6) * 0.026),
        angle: (index / pulseCount) * Math.PI * 2,
        speed: 0.35 + (index % 3) * 0.14,
        tilt: index % 2 === 0 ? 0.45 : -0.45
      }))

      connections = Array.from({ length: connectionCount }, (_, index) => ({
        innerAngle: (index / connectionCount) * Math.PI * 2,
        outerAngle: (((index * 19) % connectionCount) / connectionCount) * Math.PI * 2,
        outerRadius: size * (0.24 + (index % 4) * 0.04)
      }))

      ringLayers = Array.from({ length: ringCount }, (_, index) => ({
        radiusX: size * (0.18 + index * 0.028),
        radiusY: size * (0.13 + index * 0.024),
        tilt: (index % 4) * 0.38,
        lineWidth: 0.8 + (index % 3) * 0.28,
        alpha: 0.1 + index * 0.03,
        rotationSpeed: 0.08 + index * 0.035,
        dash: index % 2 === 0 ? [8 + index, 14 + index * 2] : [20 + index * 2, 12 + index]
      }))
    }

    const drawBrainCurves = (palette: Palette) => {
      const lobeOffset = size * 0.055
      const lobeWidth = size * 0.12
      const lobeHeight = size * 0.14

      context.save()
      context.strokeStyle = rgba(palette.ringBright, 0.82)
      context.lineWidth = 1.4
      context.shadowBlur = 18
      context.shadowColor = rgba(palette.glowMid, 0.34)

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
          context.strokeStyle = rgba(palette.particleSoft, 0.2 + wave * 0.14)
          context.lineWidth = 0.9
          context.stroke()
        }
      }

      drawLobe(-1)
      drawLobe(1)

      context.beginPath()
      context.moveTo(0, -lobeHeight * 0.84)
      context.lineTo(0, lobeHeight * 0.86)
      context.strokeStyle = rgba(palette.ringSoft, 0.34)
      context.lineWidth = 1
      context.stroke()
      context.restore()
    }

    const draw = (timestamp: number) => {
      if (document.hidden) {
        lastDrawTime = timestamp
        animationFrame = window.requestAnimationFrame(draw)
        return
      }

      if (timestamp - lastDrawTime < TARGET_FRAME_MS) {
        animationFrame = window.requestAnimationFrame(draw)
        return
      }

      lastDrawTime = timestamp
      const time = timestamp * 0.001

      currentPaletteRef.current = {
        glowCore: easeRgb(currentPaletteRef.current.glowCore, targetPaletteRef.current.glowCore, 0.06),
        glowMid: easeRgb(currentPaletteRef.current.glowMid, targetPaletteRef.current.glowMid, 0.06),
        ringBright: easeRgb(
          currentPaletteRef.current.ringBright,
          targetPaletteRef.current.ringBright,
          0.06
        ),
        ringSoft: easeRgb(currentPaletteRef.current.ringSoft, targetPaletteRef.current.ringSoft, 0.06),
        particleHot: easeRgb(
          currentPaletteRef.current.particleHot,
          targetPaletteRef.current.particleHot,
          0.08
        ),
        particleSoft: easeRgb(
          currentPaletteRef.current.particleSoft,
          targetPaletteRef.current.particleSoft,
          0.08
        ),
        panelBorder: easeRgb(
          currentPaletteRef.current.panelBorder,
          targetPaletteRef.current.panelBorder,
          0.06
        ),
        panelText: easeRgb(currentPaletteRef.current.panelText, targetPaletteRef.current.panelText, 0.06)
      }

      const palette = currentPaletteRef.current
      const outerRadius = size * 0.36
      const midRadius = size * 0.285
      const innerRadius = size * 0.132
      const shellRadius = outerRadius
      const haloRadius = outerRadius * 1.12
      const rotationTime = time * 0.62

      context.clearRect(0, 0, width, height)
      context.save()
      context.translate(width / 2, height / 2)

      const glow = context.createRadialGradient(0, 0, innerRadius * 0.08, 0, 0, haloRadius)
      glow.addColorStop(0, rgba(palette.glowCore, 0.94))
      glow.addColorStop(0.22, rgba(palette.glowMid, 0.32))
      glow.addColorStop(0.58, rgba(palette.glowMid, 0.12))
      glow.addColorStop(1, rgba(palette.glowMid, 0))
      context.fillStyle = glow
      context.beginPath()
      context.arc(0, 0, haloRadius, 0, Math.PI * 2)
      context.fill()

      context.shadowBlur = 16
      context.shadowColor = rgba(palette.glowMid, 0.26)

      ringLayers.forEach((ring, index) => {
        context.save()
        context.rotate(rotationTime * ring.rotationSpeed * (index % 2 === 0 ? 1 : -1) + ring.tilt)
        context.setLineDash(ring.dash)
        context.lineDashOffset = -time * (14 + index * 3)
        context.lineWidth = ring.lineWidth
        context.strokeStyle = rgba(index % 2 === 0 ? palette.ringBright : palette.ringSoft, ring.alpha)
        context.beginPath()
        context.ellipse(
          0,
          0,
          ring.radiusX,
          ring.radiusY,
          ring.tilt,
          0,
          Math.PI * 2
        )
        context.stroke()
        context.restore()
      })

      context.setLineDash([])

      context.save()
      context.rotate(rotationTime * 0.18)
      context.beginPath()
      context.arc(0, 0, shellRadius, 0, Math.PI * 2)
      context.lineWidth = 1.2
      context.strokeStyle = rgba(palette.ringBright, 0.34)
      context.stroke()
      context.restore()

      context.save()
      context.rotate(-rotationTime * 0.28)
      context.lineWidth = 1
      context.strokeStyle = rgba(palette.ringSoft, 0.28)
      context.beginPath()
      context.ellipse(0, 0, shellRadius * 1.02, shellRadius * 0.52, 0.15, 0, Math.PI * 2)
      context.stroke()
      context.beginPath()
      context.ellipse(0, 0, shellRadius * 0.66, shellRadius * 1.06, -0.22, 0, Math.PI * 2)
      context.stroke()
      context.restore()

      context.save()
      context.rotate(rotationTime * 0.4)
      context.beginPath()
      context.arc(0, 0, midRadius, 0, Math.PI * 2)
      context.lineWidth = 1.1
      context.strokeStyle = rgba(palette.ringBright, 0.4)
      context.stroke()
      context.beginPath()
      context.ellipse(0, 0, midRadius * 1.02, midRadius * 0.46, 0, 0, Math.PI * 2)
      context.strokeStyle = rgba(palette.ringSoft, 0.3)
      context.stroke()
      context.restore()

      context.save()
      context.rotate(-rotationTime * 0.52)
      for (let index = 0; index < 6; index += 1) {
        const start = (index / 6) * Math.PI * 2 + time * 0.08
        const end = start + Math.PI / 5.4
        context.beginPath()
        context.lineWidth = 1.4
        context.strokeStyle = rgba(index % 2 === 0 ? palette.particleHot : palette.ringSoft, 0.24)
        context.arc(0, 0, outerRadius * (0.9 + index * 0.025), start, end)
        context.stroke()
      }
      context.restore()

      context.save()
      context.strokeStyle = rgba(palette.ringSoft, 0.14)
      context.lineWidth = 0.8
      connections.forEach((connection, index) => {
        const innerX = Math.cos(connection.innerAngle + rotationTime * 0.52) * innerRadius * 0.88
        const innerY = Math.sin(connection.innerAngle + rotationTime * 0.52) * innerRadius * 0.74
        const outerX = Math.cos(connection.outerAngle - rotationTime * 0.18) * connection.outerRadius
        const outerY = Math.sin(connection.outerAngle - rotationTime * 0.18) * connection.outerRadius * 0.7
        context.beginPath()
        context.moveTo(innerX, innerY)
        context.lineTo(outerX, outerY)
        context.globalAlpha = 0.16 + (index % 3) * 0.06
        context.stroke()
      })
      context.restore()

      context.save()
      outerPoints.forEach((point, index) => {
        const projected = projectPoint(
          point.radius,
          point.theta,
          point.phi,
          rotationTime * 0.12 + index * 0.00015
        )
        context.fillStyle = rgba(palette.ringSoft, point.alpha * projected.alpha)
        context.beginPath()
        context.arc(projected.x, projected.y, point.size, 0, Math.PI * 2)
        context.fill()
      })
      context.restore()

      context.save()
      innerPoints.forEach((point, index) => {
        const projected = projectPoint(
          point.radius,
          point.theta,
          point.phi,
          -rotationTime * 0.28 + index * 0.0008
        )
        context.fillStyle = rgba(palette.particleHot, point.alpha * projected.alpha)
        context.beginPath()
        context.arc(projected.x, projected.y, point.size, 0, Math.PI * 2)
        context.fill()
      })
      context.restore()

      pulses.forEach((pulse) => {
        const angle = pulse.angle + rotationTime * (0.6 + pulse.speed)
        const x = Math.cos(angle) * pulse.radius
        const y = Math.sin(angle * 1.7) * pulse.radius * pulse.tilt
        context.fillStyle = rgba(palette.particleHot, 0.94)
        context.shadowBlur = 18
        context.shadowColor = rgba(palette.glowMid, 0.8)
        context.beginPath()
        context.arc(x, y, 3.4, 0, Math.PI * 2)
        context.fill()
      })

      context.shadowBlur = 0
      drawBrainCurves(palette)

      const coreGradient = context.createRadialGradient(0, 0, 0, 0, 0, innerRadius * 1.4)
      coreGradient.addColorStop(0, rgba(palette.particleHot, 0.97))
      coreGradient.addColorStop(0.24, rgba(palette.glowMid, 0.42))
      coreGradient.addColorStop(1, rgba(palette.glowMid, 0))
      context.fillStyle = coreGradient
      context.beginPath()
      context.arc(0, 0, innerRadius * 1.34, 0, Math.PI * 2)
      context.fill()

      context.beginPath()
      context.arc(0, 0, innerRadius * 0.5, 0, Math.PI * 2)
      context.fillStyle = rgba(palette.particleHot, 0.9)
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

  const accentStyle = {
    '--holo-panel-border': rgba((isShiftActive ? transientPalette : basePalette).panelBorder, 0.22),
    '--holo-panel-bg': rgba((isShiftActive ? transientPalette : basePalette).glowMid, 0.12),
    '--holo-panel-text': rgba((isShiftActive ? transientPalette : basePalette).panelText, 0.95),
    '--holo-panel-dim': rgba((isShiftActive ? transientPalette : basePalette).panelText, 0.68)
  } as CSSProperties

  return (
    <div className="holo-brain" ref={stageRef} style={accentStyle}>
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
})

HolographicBrain.displayName = 'HolographicBrain'
