import { describe, expect, it } from 'vitest'
import { captureDraftKey, capturePhotoKey, createCaptureStore } from './capture-store'

describe('capture store fallback', () => {
  it('stores drafts and photos without IndexedDB or localStorage', async () => {
    const store = createCaptureStore({ indexedDB: null, storage: null })
    const draftKey = captureDraftKey('round-1', 'member-1')
    const photoKey = capturePhotoKey('round-1', 'member-1', 'answers')
    const photo = new Blob(['photo'], { type: 'image/jpeg' })

    await store.saveDraft(draftKey, { words: ['CAT'] })
    await store.savePhoto(photoKey, photo)

    expect(await store.loadDraft(draftKey)).toEqual({ words: ['CAT'] })
    expect(await store.loadPhoto(photoKey)).toBe(photo)

    await store.deleteDraft(draftKey)
    await store.deletePhoto(photoKey)
    expect(await store.loadDraft(draftKey)).toBeNull()
    expect(await store.loadPhoto(photoKey)).toBeNull()
  })

  it('clears only keys in the requested scope', async () => {
    const store = createCaptureStore({ indexedDB: null, storage: null })
    await store.saveDraft('round:r1:a', { value: 1 })
    await store.saveDraft('round:r2:a', { value: 2 })
    await store.savePhoto('round:r1:photo', new Blob(['one']))

    await store.clearScope('round:r1')
    expect(await store.loadDraft('round:r1:a')).toBeNull()
    expect(await store.loadPhoto('round:r1:photo')).toBeNull()
    expect(await store.loadDraft('round:r2:a')).toEqual({ value: 2 })
  })

  it('generates stable namespaced keys', () => {
    expect(captureDraftKey('r', 'm')).toBe('round:r:member:m')
    expect(capturePhotoKey('r', 'm', 'board')).toBe('round:r:owner:m:board')
  })
})
