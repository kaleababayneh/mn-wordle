import React, { useEffect, useState, useRef } from 'react';
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
  Paper,
} from '@mui/material';
import { GameState, type WordleDerivedState, type DeployedWordleAPI } from '../../../api/src/index';

interface WordleGameProps {
  api?: DeployedWordleAPI;
  state: WordleDerivedState | null;
  isLoading?: boolean;
}

interface WordleBoardProps {
  guesses: Array<{word: string, result?: Array<number>}>;
  currentWord: string;
  isActive: boolean;
  playerName: string;
  maxGuesses?: number;
}

interface LetterTileProps {
  letter: string;
  status: 'empty' | 'filled' | 'correct' | 'present' | 'absent';
  isActive?: boolean;
}

const LetterTile: React.FC<LetterTileProps> = ({ letter, status, isActive = false }) => {
  const getBackgroundColor = (): string => {
    switch (status) {
      case 'correct': return '#4caf50'; // Green
      case 'present': return '#ff9800'; // Orange
      case 'absent': return '#757575'; // Gray
      case 'filled': return isActive ? '#333333' : '#424242'; // Dark gray for typed letters
      case 'empty': return isActive ? '#1e1e1e' : '#2e2e2e';
      default: return '#2e2e2e';
    }
  };

  const getBorderColor = (): string => {
    if (isActive && (status === 'filled' || status === 'empty')) return '#666666';
    return 'transparent';
  };

  return (
    <Box
      sx={{
        width: 50,
        height: 50,
        backgroundColor: getBackgroundColor(),
        border: `2px solid ${getBorderColor()}`,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '1.5rem',
        borderRadius: 1,
        transition: 'all 0.2s ease-in-out',
        fontFamily: 'monospace',
      }}
    >
      {letter.toUpperCase()}
    </Box>
  );
};

const WordleBoard: React.FC<WordleBoardProps> = ({ 
  guesses, 
  currentWord, 
  isActive, 
  playerName,
  maxGuesses = 6 
}) => {
  const renderRow = (rowIndex: number) => {
    const guess = guesses[rowIndex];
    const isCurrentRow = rowIndex === guesses.length && isActive;
    const word = isCurrentRow ? currentWord : (guess?.word || '');
    const result = guess?.result;

    const letters = word.padEnd(5, ' ').split('').slice(0, 5);

    return (
      <Box key={rowIndex} sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 1 }}>
        {letters.map((letter, letterIndex) => {
          let status: 'empty' | 'filled' | 'correct' | 'present' | 'absent' = 'empty';
          
          if (letter !== ' ') {
            if (result) {
              // This row has been submitted and has results
              switch (result[letterIndex]) {
                case 2: status = 'correct'; break;
                case 1: status = 'present'; break;
                case 0: status = 'absent'; break;
                default: status = 'filled';
              }
            } else {
              // This row is being typed or completed but not submitted
              status = 'filled';
            }
          }

          return (
            <LetterTile
              key={letterIndex}
              letter={letter}
              status={status}
              isActive={isCurrentRow}
            />
          );
        })}
      </Box>
    );
  };

  return (
    <Paper
      elevation={isActive ? 6 : 2}
      sx={{
        p: 3,
        backgroundColor: isActive ? '#1a1a1a' : '#2a2a2a',
        border: isActive ? '2px solid #4caf50' : '2px solid transparent',
        transition: 'all 0.3s ease-in-out',
      }}
    >
      <Typography
        variant="h6"
        align="center"
        sx={{
          mb: 2,
          color: isActive ? '#4caf50' : '#ffffff',
          fontWeight: isActive ? 'bold' : 'normal',
        }}
      >
        {playerName} {isActive && '(Your Turn)'}
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {Array.from({ length: maxGuesses }, (_, i) => renderRow(i))}
      </Box>
    </Paper>
  );
};

const WordleGame: React.FC<WordleGameProps> = ({ api, state, isLoading }) => {
  const [currentGuess, setCurrentGuess] = useState('');
  const [playerWord, setPlayerWord] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [p1Guesses, setP1Guesses] = useState<Array<{word: string, result?: Array<number>}>>([]);
  const [p2Guesses, setP2Guesses] = useState<Array<{word: string, result?: Array<number>}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const canJoinAsPlayer1 = state?.gameState === GameState.WAITING_P1;
  const canJoinAsPlayer2 = state?.gameState === GameState.WAITING_P2;
  const canMakeGuess = state?.isMyTurn && (state?.gameState === GameState.P1_GUESS_TURN || state?.gameState === GameState.P2_GUESS_TURN);
  const canVerifyGuess = state?.isMyTurn && (state?.gameState === GameState.P1_VERIFY_TURN || state?.gameState === GameState.P2_VERIFY_TURN);
  const isGameComplete = state?.gameState === GameState.P1_WINS || state?.gameState === GameState.P2_WINS || state?.gameState === GameState.DRAW;

  // Update guess history when state changes
  useEffect(() => {
    if (state?.lastGuessResult && state?.currentGuess && api) {
      const guessWord = api.wordToString(state.currentGuess);
      const result = [
        Number(state.lastGuessResult.first_letter_result),
        Number(state.lastGuessResult.second_letter_result),
        Number(state.lastGuessResult.third_letter_result),
        Number(state.lastGuessResult.fourth_letter_result),
        Number(state.lastGuessResult.fifth_letter_result),
      ];

      // Determine which player made this guess based on game state and whose turn it was
      if (state.gameState === GameState.P2_VERIFY_TURN || state.gameState === GameState.P2_GUESS_TURN) {
        // Player 1 just made a guess
        setP1Guesses(prev => {
          const existing = prev.find(g => g.word === guessWord);
          if (!existing) {
            return [...prev, { word: guessWord, result }];
          }
          return prev.map(g => g.word === guessWord ? { ...g, result } : g);
        });
      } else if (state.gameState === GameState.P1_VERIFY_TURN || state.gameState === GameState.P1_GUESS_TURN) {
        // Player 2 just made a guess
        setP2Guesses(prev => {
          const existing = prev.find(g => g.word === guessWord);
          if (!existing) {
            return [...prev, { word: guessWord, result }];
          }
          return prev.map(g => g.word === guessWord ? { ...g, result } : g);
        });
      }
    }
  }, [state?.lastGuessResult, state?.currentGuess, state?.gameState, api]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!canMakeGuess) return;

      if (e.key === 'Backspace') {
        setCurrentGuess(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (currentGuess.length === 5) {
          handleMakeGuess();
        }
      } else if (/^[a-zA-Z]$/.test(e.key) && currentGuess.length < 5) {
        setCurrentGuess(prev => prev + e.key.toUpperCase());
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [currentGuess, canMakeGuess]);

  // Focus input when it becomes the player's turn
  useEffect(() => {
    if (canMakeGuess && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canMakeGuess]);

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

  // const canJoinAsPlayer1 = state?.gameState === GameState.WAITING_P1;
  // const canJoinAsPlayer2 = state?.gameState === GameState.WAITING_P2;
  // const canMakeGuess = state?.isMyTurn && (state?.gameState === GameState.P1_GUESS_TURN || state?.gameState === GameState.P2_GUESS_TURN);
  // const canVerifyGuess = state?.isMyTurn && (state?.gameState === GameState.P1_VERIFY_TURN || state?.gameState === GameState.P2_VERIFY_TURN);
  // const isGameComplete = state?.gameState === GameState.P1_WINS || state?.gameState === GameState.P2_WINS || state?.gameState === GameState.DRAW;

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
      // Add the current guess to the appropriate player's guess list immediately for UI feedback
      if (state?.isPlayer1) {
        setP1Guesses(prev => [...prev, { word: currentGuess }]);
      } else if (state?.isPlayer2) {
        setP2Guesses(prev => [...prev, { word: currentGuess }]);
      }
      
      await api.makeGuess(currentGuess.toLowerCase());
      setCurrentGuess('');
    } catch (err) {
      // If there was an error, remove the guess we just added
      if (state?.isPlayer1) {
        setP1Guesses(prev => prev.slice(0, -1));
      } else if (state?.isPlayer2) {
        setP2Guesses(prev => prev.slice(0, -1));
      }
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

  const showGameBoards = state && state.gameState !== GameState.WAITING_P1 && state.gameState !== GameState.WAITING_P2;

  return (
    <Box sx={{ maxWidth: 1200, margin: 'auto', mt: 4 }}>
      {/* Header Card */}
      <Card sx={{ mb: 3 }}>
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
          <Box sx={{ mb: 3 }}>
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

          {/* Join Game Section */}
          {(canJoinAsPlayer1 || canJoinAsPlayer2) && (
            <Box sx={{ mb: 3, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Join Game
              </Typography>
              <TextField
                label="Your secret word (5 letters)"
                value={playerWord}
                onChange={(e) => setPlayerWord(e.target.value.toUpperCase().slice(0, 5))}
                sx={{ mb: 2, width: 300 }}
                inputProps={{ maxLength: 5, style: { textAlign: 'center', fontSize: '1.2rem' } }}
              />
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                {canJoinAsPlayer1 && (
                  <Button
                    variant="contained"
                    onClick={() => handleJoinGame(true)}
                    disabled={isSubmitting || playerWord.length !== 5}
                    size="large"
                  >
                    Join as Player 1
                  </Button>
                )}
                {canJoinAsPlayer2 && (
                  <Button
                    variant="contained"
                    onClick={() => handleJoinGame(false)}
                    disabled={isSubmitting || playerWord.length !== 5}
                    size="large"
                  >
                    Join as Player 2
                  </Button>
                )}
              </Box>
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

      {/* Game Boards */}
      {showGameBoards && (
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
          <WordleBoard
            guesses={p1Guesses}
            currentWord={state?.isPlayer1 ? currentGuess : ''}
            isActive={!!(state?.isPlayer1 && canMakeGuess)}
            playerName={state?.isPlayer1 ? 'You (Player 1)' : 'Player 1'}
          />
          <WordleBoard
            guesses={p2Guesses}
            currentWord={state?.isPlayer2 ? currentGuess : ''}
            isActive={!!(state?.isPlayer2 && canMakeGuess)}
            playerName={state?.isPlayer2 ? 'You (Player 2)' : 'Player 2'}
          />
        </Box>
      )}

      {/* Game Actions */}
      {(canMakeGuess || canVerifyGuess) && (
        <Card sx={{ mt: 3 }}>
          <CardContent sx={{ textAlign: 'center' }}>
            {canMakeGuess && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  Type your guess and press Enter, or use the button below
                </Typography>
                <TextField
                  inputRef={inputRef}
                  label="Your guess (5 letters)"
                  value={currentGuess}
                  onChange={(e) => setCurrentGuess(e.target.value.toUpperCase().slice(0, 5))}
                  sx={{ mb: 2, width: 300 }}
                  inputProps={{ 
                    maxLength: 5, 
                    style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.2em' } 
                  }}
                  autoFocus
                />
                <br />
                <Button
                  variant="contained"
                  onClick={handleMakeGuess}
                  disabled={isSubmitting || currentGuess.length !== 5}
                  size="large"
                >
                  Submit Guess
                </Button>
              </Box>
            )}

            {canVerifyGuess && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  Verify Opponent's Guess
                </Typography>
                {state?.currentGuess && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="h4" sx={{ fontFamily: 'monospace', letterSpacing: '0.3em' }}>
                      {api?.wordToString(state.currentGuess).toUpperCase()}
                    </Typography>
                  </Box>
                )}
                <Button
                  variant="contained"
                  onClick={handleVerifyGuess}
                  disabled={isSubmitting}
                  size="large"
                >
                  Verify Guess
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default WordleGame;