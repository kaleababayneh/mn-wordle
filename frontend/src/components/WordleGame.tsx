import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Button,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import { GameState, type WordleDerivedState, type DeployedWordleAPI } from '../../../api/src/index';

interface WordleGameProps {
  api?: DeployedWordleAPI;
  state: WordleDerivedState | null;
  isLoading?: boolean;
}

interface GuessResultDisplayProps {
  guess: string;
  result: { first_letter_result: bigint; second_letter_result: bigint; third_letter_result: bigint; fourth_letter_result: bigint; fifth_letter_result: bigint; } | null;
}

const GuessResultDisplay: React.FC<GuessResultDisplayProps> = ({ guess, result }) => {
  const getLetterColor = (letterResult: bigint): string => {
    const numResult = Number(letterResult);
    console.log('Letter result:', letterResult, 'Number:', numResult);
    
    switch (numResult) {
      case 2: return '#4caf50'; // Green - correct position
      case 1: return '#ff9800'; // Orange - wrong position but in word
      default: return '#9e9e9e'; // Gray - not in word
    }
  };

  if (!result) return null;

  const letters = guess.split('');
  const results = [
    result.first_letter_result,
    result.second_letter_result,
    result.third_letter_result,
    result.fourth_letter_result,
    result.fifth_letter_result,
  ];

  console.log('Guess:', guess, 'Results:', results.map(r => Number(r)));

  return (
    <Box display="flex" gap={1} justifyContent="center" my={1}>
      {letters.map((letter, index) => (
        <Box
          key={index}
          sx={{
            width: 50,
            height: 50,
            backgroundColor: getLetterColor(results[index]),
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1.2rem',
            borderRadius: 1,
          }}
        >
          {letter.toUpperCase()}
        </Box>
      ))}
    </Box>
  );
};

const WordleGame: React.FC<WordleGameProps> = ({ api, state, isLoading }) => {
  const [currentGuess, setCurrentGuess] = useState('');
  const [playerWord, setPlayerWord] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getGameStateLabel = (gameState: GameState): string => {
    switch (gameState) {
      case GameState.WAITING_P1: return 'Waiting for Player 1';
      case GameState.WAITING_P2: return 'Waiting for Player 2';
      case GameState.P1_GUESS_TURN: return 'Player 1\'s Turn to Guess';
      case GameState.P2_VERIFY_TURN: return 'Player 2 Verifying Guess';
      case GameState.P2_GUESS_TURN: return 'Player 2\'s Turn to Guess';
      case GameState.P1_VERIFY_TURN: return 'Player 1 Verifying Guess';
      case GameState.P1_WINS: return 'Player 1 Wins!';
      case GameState.P2_WINS: return 'Player 2 Wins!';
      case GameState.DRAW: return 'Game Draw!';
      default: return 'Unknown State';
    }
  };

  const getStepperSteps = () => {
    const steps = [
      'Player 1 Joins',
      'Player 2 Joins', 
      'Game in Progress',
      'Game Complete'
    ];
    return steps;
  };

  const getActiveStep = (): number => {
    if (!state) return 0;
    
    switch (state.gameState) {
      case GameState.WAITING_P1:
        return 0;
      case GameState.WAITING_P2:
        return 1;
      case GameState.P1_GUESS_TURN:
      case GameState.P2_VERIFY_TURN:
      case GameState.P2_GUESS_TURN:
      case GameState.P1_VERIFY_TURN:
        return 2;
      case GameState.P1_WINS:
      case GameState.P2_WINS:
      case GameState.DRAW:
        return 3;
      default:
        return 0;
    }
  };

  const handleJoinGame = async (asPlayer1: boolean) => {
    if (!api || !playerWord || playerWord.length !== 5) {
      setError('Please enter a 5-letter word');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log('Attempting to join game...', { asPlayer1, word: playerWord });
      
      if (asPlayer1) {
        await api.joinAsPlayer1(playerWord.toLowerCase());
      } else {
        await api.joinAsPlayer2(playerWord.toLowerCase());
      }
      setPlayerWord(''); // Clear the word for security
      console.log('Successfully joined game');
    } catch (err) {
      console.error('Join game error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to join game';
      setError(errorMessage);
      
      // Additional debugging for buffer errors
      if (errorMessage.includes('buffer')) {
        console.error('Buffer-related error detected:', err);
        setError('Connection error - please try refreshing the page and reconnecting your wallet');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMakeGuess = async () => {
    if (!api || !currentGuess || currentGuess.length !== 5) {
      setError('Please enter a 5-letter guess');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.makeGuess(currentGuess.toLowerCase());
      setCurrentGuess('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make guess');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyGuess = async () => {
    if (!api) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (state?.gameState === GameState.P2_VERIFY_TURN) {
        await api.verifyP1Guess();
      } else if (state?.gameState === GameState.P1_VERIFY_TURN) {
        await api.verifyP2Guess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify guess');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canJoinAsPlayer1 = state?.gameState === GameState.WAITING_P1;
  const canJoinAsPlayer2 = state?.gameState === GameState.WAITING_P2;
  const canMakeGuess = state?.isMyTurn && (state?.gameState === GameState.P1_GUESS_TURN || state?.gameState === GameState.P2_GUESS_TURN);
  const canVerifyGuess = state?.isMyTurn && (state?.gameState === GameState.P1_VERIFY_TURN || state?.gameState === GameState.P2_VERIFY_TURN);
  const isGameComplete = state?.gameState === GameState.P1_WINS || state?.gameState === GameState.P2_WINS || state?.gameState === GameState.DRAW;

  if (isLoading) {
    return (
      <Card sx={{ maxWidth: 600, margin: 'auto', mt: 4 }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading game...</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ maxWidth: 600, margin: 'auto', mt: 4 }}>
      <CardHeader
        title="P2P ZK Wordle"
        subheader={
          <Box>
            <Typography variant="body2">
              {state ? getGameStateLabel(state.gameState) : 'Connecting...'}
            </Typography>
            {api?.deployedContractAddress && (
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                Contract: {api.deployedContractAddress.toString()}
              </Typography>
            )}
          </Box>
        }
        action={
          <Box>
            {state && (
              <Chip
                label={`${state.playerRole === 'spectator' ? 'Spectator' : state.playerRole.charAt(0).toUpperCase() + state.playerRole.slice(1)}`}
                color={state.playerRole === 'spectator' ? 'default' : 'primary'}
                variant="outlined"
              />
            )}
          </Box>
        }
      />

      <CardContent>
        {/* Progress Stepper */}
        <Box sx={{ mb: 4 }}>
          <Stepper activeStep={getActiveStep()} alternativeLabel>
            {getStepperSteps().map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Game Status */}
        {state && (
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="textSecondary">
                Player 1 Guesses: {state.p1GuessCount.toString()}
              </Typography>
              {state.p1 && (
                <Typography variant="body2" color="textSecondary">
                  Player 1: {state.isPlayer1 ? 'You' : 'Opponent'}
                </Typography>
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="textSecondary">
                Player 2 Guesses: {state.p2GuessCount.toString()}
              </Typography>
              {state.p2 && (
                <Typography variant="body2" color="textSecondary">
                  Player 2: {state.isPlayer2 ? 'You' : 'Opponent'}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Join Game Section */}
        {(canJoinAsPlayer1 || canJoinAsPlayer2) && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Join Game
            </Typography>
            <TextField
              fullWidth
              label="Your secret word (5 letters)"
              value={playerWord}
              onChange={(e) => setPlayerWord(e.target.value.toUpperCase().slice(0, 5))}
              sx={{ mb: 2 }}
              inputProps={{ maxLength: 5 }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              {canJoinAsPlayer1 && (
                <Button
                  variant="contained"
                  onClick={() => handleJoinGame(true)}
                  disabled={isSubmitting || playerWord.length !== 5}
                >
                  Join as Player 1
                </Button>
              )}
              {canJoinAsPlayer2 && (
                <Button
                  variant="contained"
                  onClick={() => handleJoinGame(false)}
                  disabled={isSubmitting || playerWord.length !== 5}
                >
                  Join as Player 2
                </Button>
              )}
            </Box>
          </Box>
        )}

        {/* Game Actions */}
        {canMakeGuess && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Make Your Guess
            </Typography>
            <TextField
              fullWidth
              label="Your guess (5 letters)"
              value={currentGuess}
              onChange={(e) => setCurrentGuess(e.target.value.toUpperCase().slice(0, 5))}
              sx={{ mb: 2 }}
              inputProps={{ maxLength: 5 }}
            />
            <Button
              variant="contained"
              onClick={handleMakeGuess}
              disabled={isSubmitting || currentGuess.length !== 5}
            >
              Submit Guess
            </Button>
          </Box>
        )}

        {canVerifyGuess && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Verify Opponent's Guess
            </Typography>
            {state?.currentGuess && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body1">
                  Opponent's guess: <strong>{api?.wordToString(state.currentGuess).toUpperCase()}</strong>
                </Typography>
              </Box>
            )}
            <Button
              variant="contained"
              onClick={handleVerifyGuess}
              disabled={isSubmitting}
            >
              Verify Guess
            </Button>
          </Box>
        )}

        {/* Last Guess Result */}
        {state?.lastGuessResult && state?.currentGuess && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Last Guess Result
            </Typography>
            <GuessResultDisplay 
              guess={api?.wordToString(state.currentGuess) || ''} 
              result={state.lastGuessResult} 
            />
          </Box>
        )}

        {/* Game Complete */}
        {isGameComplete && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="h4" gutterBottom>
              {getGameStateLabel(state.gameState)}
            </Typography>
            {state.gameState !== GameState.DRAW && (
              <Typography variant="h6">
                Game completed in {state.gameState === GameState.P1_WINS ? state.p1GuessCount : state.p2GuessCount} guesses!
              </Typography>
            )}
          </Box>
        )}

        {isSubmitting && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default WordleGame;