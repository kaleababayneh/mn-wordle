// Browser-compatible word validation using the an-array-of-english-words library
import englishWords from 'an-array-of-english-words/index.json' with { type: "json" };

// Filter to get only 5-letter words and convert to uppercase for fast lookup
const VALID_WORDLE_WORDS = new Set(
  englishWords
    .filter((word: string) => word.length === 5)
    .map((word: string) => word.toUpperCase())
);

/**
 * Check if a word is a valid 5-letter English word for Wordle
 * @param word - The word to check (case insensitive)
 * @returns true if the word is valid, false otherwise
 */
export function isValidWordleWord(word: string): boolean {
  if (typeof word !== 'string') return false;
  
  const normalizedWord = word.toUpperCase().trim();
  
  // Must be exactly 5 letters and contain only alphabetic characters
  if (normalizedWord.length !== 5 || !/^[A-Z]+$/.test(normalizedWord)) {
    return false;
  }
  
  return VALID_WORDLE_WORDS.has(normalizedWord);
}

/**
 * Validate and normalize a word for Wordle gameplay
 * @param word - The word to validate and normalize
 * @returns The normalized word if valid, or null if invalid
 */
export function validateAndNormalizeWord(word: string): string | null {
  if (!isValidWordleWord(word)) {
    return null;
  }
  
  return word.toUpperCase().trim();
}

/**
 * Get a random valid Wordle word
 * @returns A random valid 5-letter word
 */
export function getRandomValidWord(): string {
  const wordsArray = Array.from(VALID_WORDLE_WORDS);
  const randomIndex = Math.floor(Math.random() * wordsArray.length);
  return wordsArray[randomIndex];
}

/**
 * Get the count of valid words available
 * @returns The number of valid words in the word list
 */
export function getValidWordCount(): number {
  return VALID_WORDLE_WORDS.size;
}