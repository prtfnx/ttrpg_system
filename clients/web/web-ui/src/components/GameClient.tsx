import { useEffect, useRef } from 'react'
import { useGameStore } from '../store'
import { CharacterPanel } from './CharacterPanel'
import { EntitiesPanel } from './EntitiesPanel'
import { ToolsPanel } from './ToolsPanel'

export function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { setConnection } = useGameStore()

  useEffect(() => {
    // Initialize WASM module when component mounts
    const initWasm = async () => {
      try {
        // TODO: Import and initialize WASM module
        // const wasmModule = await import('@ttrpg/rust-core')
        // await wasmModule.default()
        console.log('WASM module would be initialized here')
        
        // Simulate connection
        setConnection(true, 'test-session-' + Date.now())
      } catch (error) {
        console.error('Failed to initialize WASM module:', error)
      }
    }

    initWasm()
  }, [setConnection])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Resize canvas to container
    const resizeCanvas = () => {
      const container = canvas.parentElement
      if (container) {
        canvas.width = container.clientWidth
        canvas.height = container.clientHeight
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Basic canvas setup
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grid
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 1
    const gridSize = 50

    for (let x = 0; x <= canvas.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }

    for (let y = 0; y <= canvas.height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // Draw center indicator
    ctx.fillStyle = '#666666'
    ctx.fillRect(canvas.width / 2 - 2, canvas.height / 2 - 2, 4, 4)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <div className="game-client">
      <ToolsPanel />
      
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          width={800}
          height={600}
        />
      </div>
      
      <div className="game-panel">
        <EntitiesPanel />
        <CharacterPanel />
      </div>
    </div>
  )
}
