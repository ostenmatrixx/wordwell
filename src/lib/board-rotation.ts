export type BoardQuarterTurn = 0 | 1 | 2 | 3

export type RotatedBoardCell = {
  sourceIndex: number
  value: string
}

export function nextBoardQuarterTurn(turn: BoardQuarterTurn): BoardQuarterTurn {
  return ((turn + 1) % 4) as BoardQuarterTurn
}

export function boardRotationDegrees(turn: BoardQuarterTurn) {
  return turn * 90
}

export function boardRotationAnnouncement(turn: BoardQuarterTurn) {
  const degrees = boardRotationDegrees(turn)
  return degrees === 0 ? 'Board returned upright' : `Board rotated ${degrees} degrees clockwise`
}

/**
 * Returns the board in display order while retaining each cube's canonical
 * source index. Reordering cells instead of rotating the element keeps every
 * letter upright and lets swipe tracing continue to use the original grid.
 */
export function rotatedBoardCells(
  grid: readonly (readonly string[])[],
  turn: BoardQuarterTurn,
): RotatedBoardCell[] {
  const size = grid.length
  if (size === 0 || grid.some((row) => row.length !== size)) return []

  return Array.from({ length: size * size }, (_, displayIndex) => {
    const displayRow = Math.floor(displayIndex / size)
    const displayColumn = displayIndex % size
    let sourceRow = displayRow
    let sourceColumn = displayColumn

    if (turn === 1) {
      sourceRow = size - 1 - displayColumn
      sourceColumn = displayRow
    } else if (turn === 2) {
      sourceRow = size - 1 - displayRow
      sourceColumn = size - 1 - displayColumn
    } else if (turn === 3) {
      sourceRow = displayColumn
      sourceColumn = size - 1 - displayRow
    }

    return {
      sourceIndex: sourceRow * size + sourceColumn,
      value: grid[sourceRow][sourceColumn],
    }
  })
}
