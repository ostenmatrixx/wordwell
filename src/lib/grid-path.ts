export type BoardGridSize = 4 | 5

export type GridCoordinate = {
  row: number
  column: number
}

export type GridValidationIssue = {
  row?: number
  column?: number
  message: string
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

export function normalizeGridCell(value: string) {
  return value.trim().toUpperCase()
}

export function getGridValidationIssues(grid: readonly (readonly string[])[]): GridValidationIssue[] {
  const issues: GridValidationIssue[] = []
  const size = grid.length

  if (size !== 4 && size !== 5) {
    issues.push({ message: 'Board must contain 4 or 5 rows' })
  }

  grid.forEach((row, rowIndex) => {
    if (row.length !== size) {
      issues.push({ row: rowIndex, message: `Row ${rowIndex + 1} must contain ${size} cells` })
    }

    row.forEach((cell, columnIndex) => {
      const normalized = normalizeGridCell(cell)
      if (!/^(?:[A-Z]|QU)$/.test(normalized)) {
        issues.push({
          row: rowIndex,
          column: columnIndex,
          message: 'Each cell must be one letter or QU',
        })
      }
    })
  })

  return issues
}

export function normalizeBoardGrid(grid: readonly (readonly string[])[]): string[][] {
  const issues = getGridValidationIssues(grid)
  if (issues.length > 0) {
    throw new Error(issues[0].message)
  }

  return grid.map((row) => row.map(normalizeGridCell))
}

/**
 * Finds one deterministic path for a word. Starts and neighbours are visited in
 * row-major order, so the same grid and word always produce the same path.
 */
export function findGridPath(
  grid: readonly (readonly string[])[],
  word: string,
): GridCoordinate[] | null {
  const normalizedWord = word.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(normalizedWord)) return null

  let board: string[][]
  try {
    board = normalizeBoardGrid(grid)
  } catch {
    return null
  }

  const size = board.length
  const visited = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const path: GridCoordinate[] = []

  const search = (row: number, column: number, offset: number): boolean => {
    const token = board[row][column]
    if (!normalizedWord.startsWith(token, offset)) return false

    const nextOffset = offset + token.length
    visited[row][column] = true
    path.push({ row, column })

    if (nextOffset === normalizedWord.length) return true

    for (const [rowDelta, columnDelta] of DIRECTIONS) {
      const nextRow = row + rowDelta
      const nextColumn = column + columnDelta
      if (
        nextRow < 0 ||
        nextColumn < 0 ||
        nextRow >= size ||
        nextColumn >= size ||
        visited[nextRow][nextColumn]
      ) {
        continue
      }

      if (search(nextRow, nextColumn, nextOffset)) return true
    }

    visited[row][column] = false
    path.pop()
    return false
  }

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (search(row, column, 0)) return [...path]
    }
  }

  return null
}

export function canTraceWord(grid: readonly (readonly string[])[], word: string) {
  return findGridPath(grid, word) !== null
}

