export type CaptureStoreOptions = {
  databaseName?: string
  indexedDB?: IDBFactory | null
  storage?: Storage | null
}

export type CaptureStore = {
  saveDraft<T>(key: string, draft: T): Promise<void>
  loadDraft<T>(key: string): Promise<T | null>
  deleteDraft(key: string): Promise<void>
  savePhoto(key: string, photo: Blob): Promise<void>
  loadPhoto(key: string): Promise<Blob | null>
  deletePhoto(key: string): Promise<void>
  clearScope(scope: string): Promise<void>
}

type StoreName = 'drafts' | 'photos'

function globalIndexedDB() {
  return typeof indexedDB === 'undefined' ? null : indexedDB
}

function globalStorage() {
  if (typeof localStorage === 'undefined') return null
  try {
    const probe = '__wordwell_capture_probe__'
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export function createCaptureStore(options: CaptureStoreOptions = {}): CaptureStore {
  const databaseName = options.databaseName ?? 'wordwell-capture-v1'
  const databaseFactory = options.indexedDB === undefined ? globalIndexedDB() : options.indexedDB
  const storage = options.storage === undefined ? globalStorage() : options.storage
  const memoryDrafts = new Map<string, unknown>()
  const memoryPhotos = new Map<string, Blob>()
  let databasePromise: Promise<IDBDatabase> | null = null
  let databaseFailed = !databaseFactory

  const openDatabase = () => {
    if (databaseFailed || !databaseFactory) return Promise.reject(new Error('IndexedDB unavailable'))
    if (!databasePromise) {
      databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = databaseFactory.open(databaseName, 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('drafts')) {
            request.result.createObjectStore('drafts')
          }
          if (!request.result.objectStoreNames.contains('photos')) {
            request.result.createObjectStore('photos')
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Could not open capture database'))
        request.onblocked = () => reject(new Error('Capture database upgrade is blocked'))
      }).catch((error: unknown) => {
        databaseFailed = true
        databasePromise = null
        throw error
      })
    }
    return databasePromise
  }

  const idbGet = async <T>(storeName: StoreName, key: string) => {
    const database = await openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    return requestResult(transaction.objectStore(storeName).get(key) as IDBRequest<T | undefined>)
  }

  const idbPut = async (storeName: StoreName, key: string, value: unknown) => {
    const database = await openDatabase()
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(value, key)
    await transactionComplete(transaction)
  }

  const idbDelete = async (storeName: StoreName, key: string) => {
    const database = await openDatabase()
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(key)
    await transactionComplete(transaction)
  }

  const idbKeys = async (storeName: StoreName) => {
    const database = await openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    return requestResult(transaction.objectStore(storeName).getAllKeys())
  }

  const draftStorageKey = (key: string) => `wordwell:capture:draft:${key}`

  const saveFallbackDraft = <T>(key: string, value: T) => {
    memoryDrafts.set(key, value)
    if (!storage) return
    try {
      storage.setItem(draftStorageKey(key), JSON.stringify(value))
    } catch {
      // Private browsing and storage quotas can fail; the in-memory draft remains usable.
    }
  }

  return {
    async saveDraft(key, draft) {
      try {
        await idbPut('drafts', key, draft)
      } catch {
        saveFallbackDraft(key, draft)
      }
    },

    async loadDraft<T>(key: string) {
      try {
        const value = await idbGet<T>('drafts', key)
        if (value !== undefined) return value
      } catch {
        // Continue through persistent and in-memory fallbacks.
      }
      if (storage) {
        try {
          const value = storage.getItem(draftStorageKey(key))
          if (value !== null) return JSON.parse(value) as T
        } catch {
          // Ignore corrupt or inaccessible browser storage.
        }
      }
      return (memoryDrafts.get(key) as T | undefined) ?? null
    },

    async deleteDraft(key) {
      try {
        await idbDelete('drafts', key)
      } catch {
        // The fallback cleanup below is still useful when IndexedDB is unavailable.
      }
      memoryDrafts.delete(key)
      try {
        storage?.removeItem(draftStorageKey(key))
      } catch {
        // Ignore inaccessible browser storage.
      }
    },

    async savePhoto(key, photo) {
      try {
        await idbPut('photos', key, photo)
      } catch {
        memoryPhotos.set(key, photo)
      }
    },

    async loadPhoto(key) {
      try {
        const value = await idbGet<Blob>('photos', key)
        if (value !== undefined) return value
      } catch {
        // Photos deliberately fall back only to memory to avoid base64 storage inflation.
      }
      return memoryPhotos.get(key) ?? null
    },

    async deletePhoto(key) {
      try {
        await idbDelete('photos', key)
      } catch {
        // The in-memory cleanup below still runs.
      }
      memoryPhotos.delete(key)
    },

    async clearScope(scope) {
      const prefix = `${scope}:`
      try {
        for (const storeName of ['drafts', 'photos'] as const) {
          const keys = await idbKeys(storeName)
          await Promise.all(
            keys
              .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))
              .map((key) => idbDelete(storeName, key)),
          )
        }
      } catch {
        // Fall through to the available fallback stores.
      }

      for (const key of memoryDrafts.keys()) {
        if (key.startsWith(prefix)) memoryDrafts.delete(key)
      }
      for (const key of memoryPhotos.keys()) {
        if (key.startsWith(prefix)) memoryPhotos.delete(key)
      }

      if (storage) {
        const keys: string[] = []
        try {
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index)
            if (key?.startsWith(draftStorageKey(prefix))) keys.push(key)
          }
          keys.forEach((key) => storage.removeItem(key))
        } catch {
          // Ignore inaccessible browser storage.
        }
      }
    },
  }
}

export function captureDraftKey(roundId: string, memberId: string) {
  return `round:${roundId}:member:${memberId}`
}

export function capturePhotoKey(
  roundId: string,
  ownerId: string,
  kind: 'board' | 'answers',
) {
  return `round:${roundId}:owner:${ownerId}:${kind}`
}

