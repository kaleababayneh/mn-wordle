import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Load the words using require since it's a JSON file
const words: string[] = require('an-array-of-english-words');

// Create a set of valid 5-letter English words for fast lookup
const VALID_WORDLE_WORDS = new Set(
  words
    .filter((w: string) => 
      w.length === 5 && 
      !w.includes("'") && 
      !w.includes("-") && 
      !w.includes(" ")
    )
    .map((w: string) => w.toLowerCase())
);

/**
 * Validates if a word is a valid English 5-letter word for Wordle
 * @param word - The word to validate
 * @returns true if valid, false otherwise
 */
export function isValidWordleWord(word: string): boolean {
  if (!word || typeof word !== 'string') {
    return false;
  }
  
  const normalizedWord = word.toLowerCase().trim();
  
  // Basic validation
  if (normalizedWord.length !== 5) {
    return false;
  }
  
  // Check if contains only alphabetic characters
  if (!/^[a-z]+$/i.test(normalizedWord)) {
    return false;
  }
  
  // Check against our dictionary
  return VALID_WORDLE_WORDS.has(normalizedWord);
}

/**
 * Gets the total number of valid Wordle words available
 */
export function getValidWordCount(): number {
  return VALID_WORDLE_WORDS.size;
}

/**
 * Gets a random valid Wordle word
 */
export function getRandomValidWord(): string {
  const wordsArray = Array.from(VALID_WORDLE_WORDS);
  return wordsArray[Math.floor(Math.random() * wordsArray.length)].toUpperCase();
}

/**
 * Validates and normalizes a word for Wordle use
 * @param word - The input word
 * @returns normalized word if valid
 * @throws Error if invalid
 */
export function validateAndNormalizeWord(word: string): string {
  if (!isValidWordleWord(word)) {
    throw new Error(`"${word}" is not a valid 5-letter English word`);
  }
  return word.toUpperCase().trim();
}