export type WordFactoryBoardSize = 4 | 5
export type RandomSource = () => number
export type WordFactoryCube = readonly [string, string, string, string, string, string]

function defineCube(faces: string): WordFactoryCube {
  if (faces.length !== 6) throw new Error(`A letter cube requires six faces: ${faces}`)
  const normalized = faces.split('').map((face) => face === 'Q' ? 'QU' : face)
  return [normalized[0], normalized[1], normalized[2], normalized[3], normalized[4], normalized[5]]
}

// Word Factory does not draw 25 unrelated random letters. Like the physical
// shaker, it rumbles a fixed inventory of six-sided cubes. The 5×5 inventory
// mirrors the classic English 25-cube set; 4×4 keeps the compact cube set.
const WORD_FACTORY_CUBES_4 = [
  'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
  'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
  'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
  'EIOSST', 'ELRTTY', 'HIMNQU', 'HLNNRZ',
].map(defineCube)

const WORD_FACTORY_CUBES_5 = [
  'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
  'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQXZ', 'CCENST',
  'CEIILT', 'CEILPT', 'CEIPST', 'DDHNOT', 'DHHLOR',
  'DHLNOR', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU',
  'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU',
].map(defineCube)

function secureRandom() {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure randomness is unavailable')
  const value = new Uint32Array(1)
  globalThis.crypto.getRandomValues(value)
  return value[0] / 0x1_0000_0000
}

function randomIndex(length: number, random: RandomSource) {
  if (length <= 0) throw new Error('A die must contain at least one face')
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('Random source must return a value from 0 up to, but not including, 1')
  }
  return Math.floor(value * length)
}

export function getWordFactoryCubes(size: WordFactoryBoardSize): readonly WordFactoryCube[] {
  return size === 4 ? WORD_FACTORY_CUBES_4 : WORD_FACTORY_CUBES_5
}

export function rumbleBoardFromCubes(
  cubes: readonly (readonly string[])[],
  size: WordFactoryBoardSize,
  random: RandomSource,
) {
  if (cubes.length !== size * size) throw new Error(`A ${size}×${size} board requires ${size * size} cubes`)
  for (const cube of cubes) {
    if (cube.length !== 6 || cube.some((face) => !/^(?:[A-Z]|QU)$/.test(face))) {
      throw new Error(`Invalid cube faces: ${cube.join('')}`)
    }
  }

  const cubesInTray = [...cubes]
  for (let index = cubesInTray.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random)
    ;[cubesInTray[index], cubesInTray[swapIndex]] = [cubesInTray[swapIndex], cubesInTray[index]]
  }

  const rolled = cubesInTray.map((cube) => {
    const face = cube[randomIndex(6, random)]
    return face === 'Q' ? 'QU' : face
  })

  return Array.from({ length: size }, (_, row) => rolled.slice(row * size, (row + 1) * size))
}

export function generateWordFactoryBoard(
  size: WordFactoryBoardSize,
  random: RandomSource = secureRandom,
) {
  return rumbleBoardFromCubes(getWordFactoryCubes(size), size, random)
}
