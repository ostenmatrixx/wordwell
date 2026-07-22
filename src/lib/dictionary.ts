import wordText from 'sowpods/SOWPODS.txt?raw'

export const dictionary = new Set(
  wordText
    .split(/\r?\n/)
    .map((word) => word.trim().toUpperCase())
    .filter(Boolean),
)

export const dictionarySize = dictionary.size
