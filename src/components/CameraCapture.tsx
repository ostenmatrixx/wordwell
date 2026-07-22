import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Aperture, Camera, Check, Grid3X3, ImagePlus, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { calculateCenteredSquareCrop } from '../lib/grid'

type Props = {
  title: string
  instruction: string
  aspect?: number
  gridSize?: 4 | 5
  onCancel: () => void
  onConfirm: (image: Blob, previewUrl: string) => void
}

function BoardGridGuide({ size }: { size: 4 | 5 }) {
  return (
    <div className="board-camera-guide" aria-hidden="true">
      <div className={`board-camera-grid size-${size}`}>
        {Array.from({ length: size * size }, (_, index) => <span key={index} />)}
      </div>
      <span className="board-camera-guide-label"><Grid3X3 size={13} /> {size}×{size} alignment</span>
      <small>One tile per square</small>
    </div>
  )
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = source
  })
}

async function cropImage(source: string, area: Area, rotation: number, contrast: number) {
  const image = await loadImage(source)
  const radians = (rotation * Math.PI) / 180
  const bounds = Math.abs(Math.sin(radians)) * image.width + Math.abs(Math.cos(radians)) * image.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(image.width, Math.ceil(bounds))
  canvas.height = Math.max(image.height, Math.ceil(bounds))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')

  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(radians)
  context.filter = `contrast(${contrast}%) grayscale(100%)`
  context.drawImage(image, -image.width / 2, -image.height / 2)

  const output = document.createElement('canvas')
  output.width = area.width
  output.height = area.height
  const outputContext = output.getContext('2d')
  if (!outputContext) throw new Error('Canvas is unavailable')
  outputContext.drawImage(canvas, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)

  return new Promise<Blob>((resolve, reject) => {
    output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare image')), 'image/jpeg', 0.9)
  })
}

export function CameraCapture({ title, instruction, aspect, gridSize, onCancel, onConfirm }: Props) {
  const [source, setSource] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [contrast, setContrast] = useState(125)
  const [area, setArea] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const inputId = useMemo(() => `capture-${crypto.randomUUID()}`, [])
  const supportsLiveCamera = Boolean(gridSize && navigator.mediaDevices?.getUserMedia)

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source)
  }, [source])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!cameraActive || !video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => setCameraError('The camera preview could not start. Choose a photo instead.'))
  }, [cameraActive])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  function useSource(nextSource: string) {
    if (source) URL.revokeObjectURL(source)
    setSource(nextSource)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setArea(null)
  }

  function chooseFile(file: File | undefined) {
    if (!file) return
    stopCamera()
    useSource(URL.createObjectURL(file))
  }

  async function startCamera() {
    if (!supportsLiveCamera) return
    setCameraStarting(true)
    setCameraError(null)
    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
      })
      streamRef.current = stream
      setCameraActive(true)
    } catch (error) {
      const permissionDenied = error instanceof DOMException && error.name === 'NotAllowedError'
      setCameraError(
        permissionDenied
          ? 'Camera permission was denied. Allow access in your browser settings or choose a photo.'
          : 'The rear camera is unavailable. You can still use the camera or photo library below.',
      )
    } finally {
      setCameraStarting(false)
    }
  }

  async function captureFrame() {
    try {
      const video = videoRef.current
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setCameraError('The camera is still focusing. Try again in a moment.')
        return
      }

      const frame = calculateCenteredSquareCrop(video.videoWidth, video.videoHeight)
      const outputSize = Math.min(1600, frame.width)
      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable')
      context.drawImage(
        video,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        0,
        0,
        outputSize,
        outputSize,
      )
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not capture camera frame')), 'image/jpeg', 0.92)
      })
      stopCamera()
      useSource(URL.createObjectURL(blob))
    } catch {
      setCameraError('The photo could not be captured. Try again or choose a photo instead.')
    }
  }

  async function confirm() {
    if (!source || !area) return
    setWorking(true)
    try {
      const blob = await cropImage(source, area, rotation, contrast)
      onConfirm(blob, URL.createObjectURL(blob))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="capture-overlay" role="dialog" aria-modal="true" aria-labelledby="capture-title">
      <div className="capture-sheet">
        <header>
          <div>
            <p className="section-kicker">Private on-device scan</p>
            <h2 id="capture-title">{title}</h2>
            <p>{instruction}</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close camera"><X /></button>
        </header>

        {!source ? gridSize && cameraActive ? (
          <div className="live-camera-panel">
            <div className="live-camera-stage">
              <video ref={videoRef} autoPlay muted playsInline aria-label={`Live camera with ${gridSize} by ${gridSize} board alignment guide`} />
              <BoardGridGuide size={gridSize} />
            </div>
            <p className="live-camera-tip"><Aperture size={15} /> Hold the phone level and place one tile inside every square.</p>
            {cameraError && <p className="capture-error" role="alert">{cameraError}</p>}
            <div className="live-camera-actions">
              <label className="secondary-button" htmlFor={inputId}><ImagePlus size={17} /> Choose photo</label>
              <input className="sr-only" id={inputId} type="file" accept="image/*" capture="environment" onChange={(event) => chooseFile(event.target.files?.[0])} />
              <button className="camera-shutter" type="button" onClick={() => void captureFrame()} aria-label="Take board photo"><span><Camera size={23} /></span> Take photo</button>
            </div>
          </div>
        ) : (
          <div className="capture-empty">
            <span className="camera-orbit"><Camera size={38} /></span>
            <h3>{gridSize ? `Frame the ${gridSize}×${gridSize} board` : 'Line it up, then snap'}</h3>
            <p>{gridSize ? 'Use the live alignment guide so every tile lands in its own square. The grid is only a guide and is not saved in the photo.' : 'The picture stays on this phone and is removed after you confirm the extracted letters.'}</p>
            {cameraError && <p className="capture-error" role="alert">{cameraError}</p>}
            <div className="capture-empty-actions">
              {gridSize && supportsLiveCamera && <button className="primary-button" type="button" onClick={() => void startCamera()} disabled={cameraStarting}><Camera size={18} /> {cameraStarting ? 'Opening camera…' : 'Open guided camera'}</button>}
              <label className={gridSize && supportsLiveCamera ? 'secondary-button' : 'primary-button'} htmlFor={inputId}><ImagePlus size={18} /> Camera or gallery</label>
            </div>
            <input className="sr-only" id={inputId} type="file" accept="image/*" capture="environment" onChange={(event) => chooseFile(event.target.files?.[0])} />
          </div>
        ) : (
          <>
            <div className={`crop-stage${gridSize ? ' is-board' : ''}`}>
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
              {gridSize && <BoardGridGuide size={gridSize} />}
            </div>
            {gridSize && <p className="board-crop-tip"><Grid3X3 size={14} /> Align the outside tiles with the guide, then check that every square contains one tile.</p>}
            <div className="capture-controls">
              <label><span>Zoom</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
              <label><span><SlidersHorizontal size={15} /> Contrast</span><input type="range" min="80" max="200" value={contrast} onChange={(event) => setContrast(Number(event.target.value))} /></label>
              <button className="secondary-button" type="button" onClick={() => setRotation((value) => (value + 90) % 360)}><RotateCcw size={17} /> Rotate</button>
            </div>
            <div className="capture-actions">
              <label className="secondary-button" htmlFor={inputId}>Retake</label>
              <input className="sr-only" id={inputId} type="file" accept="image/*" capture="environment" onChange={(event) => chooseFile(event.target.files?.[0])} />
              <button className="primary-button" type="button" onClick={confirm} disabled={working || !area}>
                <Check size={18} /> {working ? 'Preparing…' : 'Use this crop'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
