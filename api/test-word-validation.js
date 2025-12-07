// Quick test for word validation
import { isValidWordleWord, getRandomValidWord, getValidWordCount, validateAndNormalizeWord } from '../src/utils/wordValidation.js';

console.log('Testing word validation...');

// Test valid words
console.log('Valid words:');
console.log('CRANE:', isValidWordleWord('CRANE')); // Should be true
console.log('SLATE:', isValidWordleWord('SLATE')); // Should be true
console.log('WORDS:', isValidWordleWord('WORDS')); // Should be true
console.log('HELLO:', isValidWordleWord('HELLO')); // Should be true

// Test invalid words
console.log('\nInvalid words:');
console.log('INVALID (too long):', isValidWordleWord('INVALID')); // Should be false
console.log('HI (too short):', isValidWordleWord('HI')); // Should be false
console.log('ZZZZZ (not a word):', isValidWordleWord('ZZZZZ')); // Should be false
console.log('H3LL0 (contains numbers):', isValidWordleWord('H3LL0')); // Should be false
console.log("DON'T (contains apostrophe):", isValidWordleWord("DON'T")); // Should be false

// Test normalization
console.log('\nNormalization tests:');
try {
  console.log('crane -> ', validateAndNormalizeWord('crane')); // Should return 'CRANE'
  console.log('  hello  -> ', validateAndNormalizeWord('  hello  ')); // Should return 'HELLO'
} catch (error) {
  console.error('Normalization error:', error.message);
}

// Test random word
console.log('\nRandom valid word:', getRandomValidWord());
console.log('Total valid words:', getValidWordCount());

// Test error handling
console.log('\nError handling:');
try {
  validateAndNormalizeWord('ZZZZZ');
} catch (error) {
  console.log('Expected error for ZZZZZ:', error.message);
}

console.log('Word validation tests completed!');