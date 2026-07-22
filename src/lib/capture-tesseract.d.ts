declare module 'tesseract.js' {
  export function createWorker(
    language?: string,
    oem?: number,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void
      workerPath?: string
      corePath?: string
      langPath?: string
    },
  ): Promise<{
    recognize(image: Blob): Promise<{ data?: unknown }>
    setParameters?(parameters: Record<string, string>): Promise<void>
    terminate(): Promise<void>
  }>
}
