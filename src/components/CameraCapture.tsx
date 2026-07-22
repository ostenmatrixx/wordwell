import { useEffect, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Camera, Check, ImagePlus, RotateCcw, SlidersHorizontal, X } from 'lucide-react'

type Props = {
  title: string
  instruction: string
  aspect?: number
  onCancel: () => void
  onConfirm: (image: Blob, previewUrl: string) => void
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

export function CameraCapture({ title, instruction, aspect, onCancel, onConfirm }: Props) {
  const [source, setSource] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [contrast, setContrast] = useState(125)
  const [area, setArea] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)
  const inputId = useMemo(() => `capture-${crypto.randomUUID()}`, [])

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source)
  }, [source])

  function chooseFile(file: File | undefined) {
    if (!file) return
    if (source) URL.revokeObjectURL(source)
    setSource(URL.createObjectURL(file))
    setCrop({ x: 0, y: 0 })
    setZoom(1)
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

        {!source ? (
          <div className="capture-empty">
            <span className="camera-orbit"><Camera size={38} /></span>
            <h3>Line it up, then snap</h3>
            <p>The picture stays on this phone and is removed after you confirm the extracted letters.</p>
            <label className="primary-button" htmlFor={inputId}><ImagePlus size={18} /> Open camera or gallery</label>
            <input
              className="sr-only"
              id={inputId}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </div>
        ) : (
          <>
            <div className="crop-stage">
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
            </div>
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

