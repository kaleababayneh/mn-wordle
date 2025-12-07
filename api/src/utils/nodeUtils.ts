// Node.js specific utils export - avoids browser imports that cause JSON import issues
export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

// Export only the Node.js compatible word validation functions
export * from './wordValidation.js';