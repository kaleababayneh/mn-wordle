import React from 'react';
import Confetti from 'react-confetti';

interface ConfettiProps {
  width: number;
  height: number;
}

export function WinnerConfetti({ width, height }: ConfettiProps) {
  return (
    <Confetti
      width={width}
      height={height}
      numberOfPieces={1000}
      gravity={0.3}
      wind={0.01}
      colors={['#f43f5e', '#22c55e', '#3b82f6', '#eab308', '#8b5cf6', '#06b6d4']}
      recycle={false}
      run={true}
    />
  );
}

export function LoserConfetti({ width, height }: ConfettiProps) {
  return (
    <Confetti
      width={width}
      height={height}
      numberOfPieces={500}
      gravity={0.2}
      wind={0}
      colors={['#555', '#444', '#333', '#666']} // sad grayscale
      recycle={false}
      run={true}
    />
  );
}