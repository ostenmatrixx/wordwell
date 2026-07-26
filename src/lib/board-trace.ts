export type BoardTraceSubmission =
  | { status: 'empty'; word: '' }
  | { status: 'too-short'; word: string }
  | { status: 'submitted'; word: string }

function isBoardIndex(index: number, size: number) {
  return Number.isInteger(index) && index >= 0 && index < size * size
}

export function areBoardTilesAdjacent(leftIndex: number, rightIndex: number, size: number) {
  if (!isBoardIndex(leftIndex, size) || !isBoardIndex(rightIndex, size) || leftIndex === rightIndex) {
    return false
  }

  const leftRow = Math.floor(leftIndex / size)
  const leftColumn = leftIndex % size
  const rightRow = Math.floor(rightIndex / size)
  const rightColumn = rightIndex % size

  return Math.abs(leftRow - rightRow) <= 1 && Math.abs(leftColumn - rightColumn) <= 1
}

/**
 * Adds a neighbouring tile, ignores jumps/reuse, and removes the final tile
 * when the player slides directly back to the previous one.
 */
export function extendBoardTrace(path: readonly number[], nextIndex: number, size: number) {
  if (!isBoardIndex(nextIndex, size)) return [...path]
  if (path.length === 0) return [nextIndex]

  const currentIndex = path[path.length - 1]
  if (nextIndex === currentIndex) return [...path]
  if (path.length > 1 && nextIndex === path[path.length - 2]) return path.slice(0, -1)
  if (path.includes(nextIndex) || !areBoardTilesAdjacent(currentIndex, nextIndex, size)) return [...path]

  return [...path, nextIndex]
}

export function boardTraceWord(grid: readonly (readonly string[])[], path: readonly number[]) {
  const size = grid.length
  if ((size !== 4 && size !== 5) || grid.some((row) => row.length !== size)) return ''

  const cells = path.map((index) => {
    if (!isBoardIndex(index, size)) return ''
    return grid[Math.floor(index / size)][index % size]?.trim().toUpperCase() ?? ''
  })

  return cells.every(Boolean) ? cells.join('') : ''
}

export function submitBoardTrace(
  grid: readonly (readonly string[])[],
  path: readonly number[],
  minimumLength: number,
  onSubmit: (word: string) => void,
): BoardTraceSubmission {
  const word = boardTraceWord(grid, path)
  if (!word) return { status: 'empty', word: '' }
  if (word.length < minimumLength) return { status: 'too-short', word }

  onSubmit(word)
  return { status: 'submitted', word }
}
