export type WordFactoryBoardSize = 4 | 5
export type RandomSource = () => number

// Fixed dice-style sets keep vowels and uncommon letters balanced while still
// producing a fresh board every round. Q is represented as the Word Factory QU tile.
const WORD_FACTORY_DICE_4 = [
  'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
  'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
  'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
  'EIOSST', 'ELRTTY', 'HIMNQU', 'HLNNRZ',
] as const

const WORD_FACTORY_DICE_5 = [
  'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
  'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQXZ', 'CCENST',
  'CEIILT', 'CEILPT', 'CEIPST', 'DDHNOT', 'DHHLOR',
  'DHHNOW', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU',
  'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU',
] as const

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

export function getWordFactoryDice(size: WordFactoryBoardSize): readonly string[] {
  return size === 4 ? WORD_FACTORY_DICE_4 : WORD_FACTORY_DICE_5
}

export function generateBoardFromDice(
  dice: readonly string[],
  size: WordFactoryBoardSize,
  random: RandomSource,
) {
  if (dice.length !== size * size) throw new Error(`A ${size}×${size} board requires ${size * size} dice`)

  const rolled = dice.map((die) => {
    if (!/^[A-Z]+$/.test(die)) throw new Error(`Invalid die faces: ${die}`)
    const face = die[randomIndex(die.length, random)]
    return face === 'Q' ? 'QU' : face
  })

  for (let index = rolled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random)
    ;[rolled[index], rolled[swapIndex]] = [rolled[swapIndex], rolled[index]]
  }

  return Array.from({ length: size }, (_, row) => rolled.slice(row * size, (row + 1) * size))
}

export function generateWordFactoryBoard(
  size: WordFactoryBoardSize,
  random: RandomSource = secureRandom,
) {
  return generateBoardFromDice(getWordFactoryDice(size), size, random)
}
