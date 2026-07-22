import type { BoardGridSize } from './grid-path'

export type CropRectangle = {
  x: number
  y: number
  width: number
  height: number
}

export type ImagePreprocessOptions = {
  crop?: CropRectangle
  rotation?: 0 | 90 | 180 | 270
  brightness?: number
  contrast?: number
  maxDimension?: number
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
  quality?: number
}

export type GridCellRectangle = CropRectangle & {
  row: number
  column: number
}

export type GridCellImage = GridCellRectangle & {
  blob: Blob
}

export type GridCellRotation = 0 | 90 | 180 | 270

export type GridCellOcrVariant = {
  blob: Blob
  rotation: GridCellRotation
}

export type GridCellOcrPreprocessOptions = {
  rotations?: readonly GridCellRotation[]
  paddingRatio?: number
  sourceInsetRatio?: number
  minimumDimension?: number
  maximumDimension?: number
  brightness?: number
  contrast?: number
}

export const GRID_CELL_OCR_ROTATIONS: readonly GridCellRotation[] = [0, 90, 180, 270]

function requireDocument() {
  if (typeof document === 'undefined') {
    throw new Error('Image processing requires a browser canvas')
  }
  return document
}

function createCanvas(width: number, height: number) {
  const canvas = requireDocument().createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function getContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
  if (!context) throw new Error('2D canvas is not available')
  return context
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: ImagePreprocessOptions['mimeType'] = 'image/jpeg',
  quality = 0.9,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode processed image'))),
      mimeType,
      quality,
    )
  })
}

async function decodeImage(blob: Blob): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }

  const browserDocument = requireDocument()
  const url = URL.createObjectURL(blob)
  const image = browserDocument.createElement('img')
  image.decoding = 'async'
  image.src = url
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Could not decode image'))
  })
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function sanitizeCrop(crop: CropRectangle | undefined, width: number, height: number): CropRectangle {
  if (!crop) return { x: 0, y: 0, width, height }
  const x = clamp(crop.x, 0, Math.max(0, width - 1))
  const y = clamp(crop.y, 0, Math.max(0, height - 1))
  return {
    x,
    y,
    width: clamp(crop.width, 1, width - x),
    height: clamp(crop.height, 1, height - y),
  }
}

export async function preprocessImage(blob: Blob, options: ImagePreprocessOptions = {}) {
  const decoded = await decodeImage(blob)
  try {
    const crop = sanitizeCrop(options.crop, decoded.width, decoded.height)
    const rotation = options.rotation ?? 0
    const rotated = rotation === 90 || rotation === 270
    const outputWidth = rotated ? crop.height : crop.width
    const outputHeight = rotated ? crop.width : crop.height
    const maxDimension = Math.max(1, options.maxDimension ?? 2400)
    const scale = Math.min(1, maxDimension / Math.max(outputWidth, outputHeight))
    const canvas = createCanvas(outputWidth * scale, outputHeight * scale)
    const context = getContext(canvas)

    context.save()
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.filter = `brightness(${clamp(options.brightness ?? 100, 20, 300)}%) contrast(${clamp(options.contrast ?? 100, 20, 300)}%)`
    context.drawImage(
      decoded.source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      (-crop.width * scale) / 2,
      (-crop.height * scale) / 2,
      crop.width * scale,
      crop.height * scale,
    )
    context.restore()

    return await canvasToBlob(canvas, options.mimeType, options.quality)
  } finally {
    decoded.release()
  }
}

export function calculateGridCellRectangles(
  width: number,
  height: number,
  size: BoardGridSize,
  insetRatio = 0.04,
): GridCellRectangle[] {
  if (width <= 0 || height <= 0) throw new Error('Image dimensions must be positive')
  const safeInset = clamp(insetRatio, 0, 0.45)
  const cellWidth = width / size
  const cellHeight = height / size
  const insetX = cellWidth * safeInset
  const insetY = cellHeight * safeInset
  const cells: GridCellRectangle[] = []

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      cells.push({
        row,
        column,
        x: column * cellWidth + insetX,
        y: row * cellHeight + insetY,
        width: cellWidth - insetX * 2,
        height: cellHeight - insetY * 2,
      })
    }
  }

  return cells
}

export async function splitBoardImageIntoCells(
  boardImage: Blob,
  size: BoardGridSize,
  options: Pick<ImagePreprocessOptions, 'mimeType' | 'quality'> & { insetRatio?: number } = {},
): Promise<GridCellImage[]> {
  const decoded = await decodeImage(boardImage)
  try {
    const rectangles = calculateGridCellRectangles(
      decoded.width,
      decoded.height,
      size,
      options.insetRatio,
    )

    return await Promise.all(
      rectangles.map(async (rectangle) => {
        const canvas = createCanvas(rectangle.width, rectangle.height)
        getContext(canvas).drawImage(
          decoded.source,
          rectangle.x,
          rectangle.y,
          rectangle.width,
          rectangle.height,
          0,
          0,
          canvas.width,
          canvas.height,
        )
        return {
          ...rectangle,
          blob: await canvasToBlob(canvas, options.mimeType ?? 'image/png', options.quality ?? 0.92),
        }
      }),
    )
  } finally {
    decoded.release()
  }
}

/**
 * Produces padded, high-contrast copies of one tile at every quarter turn.
 * Physical Word Factory/Boggle tiles can be independently rotated, so rotating
 * the whole board photo is not enough. Decoding once keeps the four variants
 * inexpensive compared with the OCR passes that consume them.
 */
export async function createGridCellOcrVariants(
  cell: GridCellImage,
  options: GridCellOcrPreprocessOptions = {},
): Promise<GridCellOcrVariant[]> {
  const decoded = await decodeImage(cell.blob)
  try {
    const rotations = options.rotations ?? GRID_CELL_OCR_ROTATIONS
    const paddingRatio = clamp(options.paddingRatio ?? 0.16, 0.05, 0.3)
    const sourceInsetRatio = clamp(options.sourceInsetRatio ?? 0.12, 0, 0.25)
    const minimumDimension = Math.max(64, options.minimumDimension ?? 224)
    const maximumDimension = Math.max(minimumDimension, options.maximumDimension ?? 512)
    const sourceX = decoded.width * sourceInsetRatio
    const sourceY = decoded.height * sourceInsetRatio
    const sourceWidth = decoded.width - sourceX * 2
    const sourceHeight = decoded.height - sourceY * 2
    const sourceDimension = Math.max(sourceWidth, sourceHeight)
    const contentDimension = clamp(sourceDimension * 2, minimumDimension, maximumDimension)
    const canvasDimension = Math.ceil(contentDimension / (1 - paddingRatio * 2))
    const scale = Math.min(contentDimension / sourceWidth, contentDimension / sourceHeight)
    const brightness = clamp(options.brightness ?? 108, 20, 300)
    const contrast = clamp(options.contrast ?? 175, 20, 300)

    return await Promise.all(
      rotations.map(async (rotation) => {
        const canvas = createCanvas(canvasDimension, canvasDimension)
        const context = getContext(canvas)
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.save()
        context.translate(canvas.width / 2, canvas.height / 2)
        context.rotate((rotation * Math.PI) / 180)
        context.filter = `grayscale(100%) brightness(${brightness}%) contrast(${contrast}%)`
        context.drawImage(
          decoded.source,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          (-sourceWidth * scale) / 2,
          (-sourceHeight * scale) / 2,
          sourceWidth * scale,
          sourceHeight * scale,
        )
        context.restore()

        return {
          rotation,
          blob: await canvasToBlob(canvas, 'image/png', 1),
        }
      }),
    )
  } finally {
    decoded.release()
  }
}
