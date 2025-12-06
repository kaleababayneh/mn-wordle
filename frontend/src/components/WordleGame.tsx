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

    const displayWord = word.padEnd(5, ' ').split('').slice(0, 5);

    return (
      <Box key={rowIndex} sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 1 }}>
        {displayWord.map((letter, letterIndex) => {
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
              letter={letter === '.' ? '•' : letter}
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
  const [myGuesses, setMyGuesses] = useState<Array<{word: string, result?: Array<number>}>>([]);
  const [opponentGuesses, setOpponentGuesses] = useState<Array<{word: string, result?: Array<number>}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const canJoinAsPlayer1 = state?.gameState === GameState.WAITING_P1;
  const canJoinAsPlayer2 = state?.gameState === GameState.WAITING_P2;
  
  const isGameComplete = state?.gameState === GameState.P1_WINS || state?.gameState === GameState.P2_WINS || state?.gameState === GameState.DRAW;
  
  // Simplified and more explicit logic for when players can make guesses
  const canMakeGuess = state && !isGameComplete && (
    (state.isPlayer1 && state.gameState === GameState.P1_GUESS_TURN) ||
    (state.isPlayer2 && state.gameState === GameState.P2_GUESS_TURN)
  );

  // Update guess arrays using the new API helper methods
  useEffect(() => {
    if (!api || !state) return;

    const loadGuesses = async () => {
      try {
        // Get structured guess data from the API
        const myCurrentGuesses = await api.getMyGuesses();
        const opponentCurrentGuesses = await api.getOpponentGuesses();

        console.log('=== API GUESS DATA ===');
        console.log('My guesses from API:', myCurrentGuesses);
        console.log('Opponent guesses from API:', opponentCurrentGuesses);
        
        // Additional debugging: test direct access to getPlayerGuesses
        console.log('=== DIRECT API ACCESS TEST ===');
        try {
          const p1Guesses = await api.getPlayerGuesses('player1');
          const p2Guesses = await api.getPlayerGuesses('player2');
          console.log('Direct P1 guesses:', p1Guesses);
          console.log('Direct P2 guesses:', p2Guesses);
        } catch (error) {
          console.error('Error calling getPlayerGuesses directly:', error);
        }
        console.log('=== END API TEST ===');

        // Update state with structured data from API
        setMyGuesses(myCurrentGuesses.map(g => ({
          word: g.word,
          result: g.result || undefined // Convert null to undefined for type compatibility
        })));

        setOpponentGuesses(opponentCurrentGuesses.map(g => ({
          word: g.word,
          result: g.result || undefined // Convert null to undefined for type compatibility
        })));
      } catch (error) {
        console.error('Error loading guesses:', error);
        // Fallback to empty arrays if API methods fail
        setMyGuesses([]);
        setOpponentGuesses([]);
      }
    };

    loadGuesses();
  }, [api, state?.p1GuessCount, state?.p2GuessCount, state?.p1Results, state?.p2Results]);

  // Debug: Log state changes
  useEffect(() => {
    if (state && api) {
      console.log('=== STATE DEBUG ===');
      console.log('Game state:', state.gameState);
      console.log('Current guess from contract:', state.currentGuess ? api.wordToString(state.currentGuess) : 'null');
      console.log('P1 guess count:', state.p1GuessCount.toString());
      console.log('P2 guess count:', state.p2GuessCount.toString());
      console.log('My guesses array:', myGuesses);
      console.log('Opponent guesses array:', opponentGuesses);
      console.log('Is Player 1:', state.isPlayer1);
      console.log('Is Player 2:', state.isPlayer2);
      console.log('Current player can make guess:', canMakeGuess);
      console.log('==================');
    }
  }, [state, myGuesses, opponentGuesses, api, canMakeGuess]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle keyboard input if this player can make a guess
      if (!canMakeGuess) return;

      // Prevent default behavior for handled keys to avoid interference
      if (e.key === 'Backspace' || e.key === 'Enter' || /^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
      }

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

  // Clear current guess when it's not the player's turn
  useEffect(() => {
    if (!canMakeGuess) {
      setCurrentGuess('');
    }
  }, [canMakeGuess]);

  const getGameStateLabel = (gameState: GameState): string => {
    switch (gameState) {
      case GameState.WAITING_P1: return 'Waiting for Player 1';
      case GameState.WAITING_P2: return 'Waiting for Player 2';
      case GameState.P1_GUESS_TURN: return 'Player 1\'s Turn to Guess';
      case GameState.P2_GUESS_TURN: return 'Player 2\'s Turn to Guess';
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
      case GameState.P2_GUESS_TURN:
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
      
      // Check for specific error types
      if (errorMessage.includes('buffer') || errorMessage.includes('Invalid proof') || errorMessage.includes('self-verification failed')) {
        setError('Private state error detected. Please refresh the page, reconnect your wallet, and try again. If the issue persists, try clearing your browser data for this site.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMakeGuess = async () => {
    console.log('handleMakeGuess called with currentGuess:', currentGuess, 'length:', currentGuess.length);
    
    if (!api || !currentGuess || currentGuess.length !== 5) {
      setError('Please enter a 5-letter guess');
      return;
    }

    // Additional validation
    if (!/^[A-Z]{5}$/.test(currentGuess)) {
      setError('Please enter exactly 5 letters (A-Z only)');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log('Making guess with word:', currentGuess, 'length:', currentGuess.length, 'lowercase:', currentGuess.toLowerCase());
      // The contract now automatically handles verification during guess transactions
      await api.makeGuess(currentGuess.toLowerCase());
      setCurrentGuess('');
    } catch (err) {
      console.error('Make guess error:', err);
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to make guess';
      console.error('Error details:', errorMessage);
      
      // Check for specific error types
      if (errorMessage.includes('length') || errorMessage.includes('input')) {
        setError(`Word validation error: ${errorMessage}. Please ensure you entered exactly 5 letters.`);
      } else if (errorMessage.includes('Unexpected length')) {
        setError(`State synchronization error. Try refreshing the page and reconnecting your wallet.`);
      } else if (errorMessage.includes('Invalid proof') || errorMessage.includes('self-verification failed') || errorMessage.includes('private state inconsistency')) {
        setError(`Cryptographic key mismatch detected. This can happen if your private state becomes corrupted. Please refresh the page, reconnect your wallet, and if the issue persists, try clearing your browser's localStorage for this site.`);
      } else {
        setError(errorMessage);
      }
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

      {/* Game Boards - Show both player's boards for competitive feel */}
      {showGameBoards && state && (
        <>
          {/* Player 1's view: P1 board active, P2 board as opponent */}
          {state.isPlayer1 === true && state.isPlayer2 !== true && (
            <Box sx={{ display: 'flex', gap: 4, maxWidth: 1400, margin: 'auto', justifyContent: 'center' }}>
              {/* Player 1's Active Board */}
              <Box sx={{ flex: 1, minWidth: 400, maxWidth: 600 }}>
                <Typography variant="h4" align="center" sx={{ mb: 3, color: '#4caf50' }}>
                  🟩 Your Board (Player 1)
                </Typography>
                
                <WordleBoard
                  guesses={state.isPlayer1 ? myGuesses : []} // Show my own guesses when I'm player 1
                  currentWord={canMakeGuess ? currentGuess : ''}
                  isActive={!!canMakeGuess}
                  playerName=""
                />
                
                {/* Player 1 Actions */}
                {canMakeGuess && (
                  <Box sx={{ mt: 3, p: 3, backgroundColor: '#e8f5e8', borderRadius: 2, border: '2px solid #4caf50' }}>
                    <Typography variant="h6" gutterBottom sx={{ color: '#2e7d32' }}>
                      🎯 Your Turn! Type your guess (5 letters)
                    </Typography>
                    <TextField
                      inputRef={inputRef}
                      label="Player 1 guess (5 letters)"
                      value={currentGuess}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
                        setCurrentGuess(value);
                      }}
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
                      sx={{ backgroundColor: '#4caf50', '&:hover': { backgroundColor: '#388e3c' } }}
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit P1 Guess'}
                    </Button>
                    <Typography variant="body2" sx={{ mt: 1, color: '#666' }}>
                      This will automatically verify Player 2's previous guess (if any) and make your guess
                    </Typography>
                  </Box>
                )}
                
                {!canMakeGuess && (
                  <Box sx={{ mt: 3, p: 3, backgroundColor: '#f5f5f5', borderRadius: 2 }}>
                    <Typography variant="h6" gutterBottom sx={{ color: '#666' }}>
                      ⏳ Waiting for Player 2...
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {state.gameState === GameState.P2_GUESS_TURN && "Player 2 is making their guess"}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Player 2's Opponent Board (Read-only) */}
              <Box sx={{ flex: 1, minWidth: 400, maxWidth: 600, opacity: 0.8 }}>
                <Typography variant="h5" align="center" sx={{ mb: 2, color: '#1976d2' }}>
                  🟦 Opponent's Board (Player 2)
                </Typography>
                
                <WordleBoard
                  guesses={opponentGuesses} // Show opponent's guesses (Player 2 when I'm Player 1)
                  currentWord="" // Never show opponent's current typing
                  isActive={false}
                  playerName=""
                />
                
                {/*<Box sx={{ mt: 2, p: 2, backgroundColor: '#f0f0f0', borderRadius: 2, textAlign: 'center' }}>
                   <Typography variant="body2" sx={{ color: '#666' }}>
                    Guesses: {state.p2GuessCount.toString()}/6 
                    {state.gameState === GameState.P2_GUESS_TURN && " • Currently guessing..."}
                    {state.gameState === GameState.P1_GUESS_TURN && " • Waiting for your move"}
                  </Typography> 
                </Box>*/}
              </Box>
            </Box>
          )}
          
          {/* Player 2's view: P2 board active, P1 board as opponent */}
          {state.isPlayer2 === true && state.isPlayer1 !== true && (
            <Box sx={{ display: 'flex', gap: 4, maxWidth: 1400, margin: 'auto', justifyContent: 'center' }}>
              {/* Player 2's Active Board */}
              <Box sx={{ flex: 1, minWidth: 400, maxWidth: 600 }}>
                <Typography variant="h4" align="center" sx={{ mb: 3, color: '#2196f3' }}>
                  🟦 Your Board (Player 2)
                </Typography>
                
                <WordleBoard
                  guesses={state.isPlayer2 ? myGuesses : []} // Show my own guesses when I'm player 2
                  currentWord={canMakeGuess ? currentGuess : ''}
                  isActive={!!canMakeGuess}
                  playerName=""
                />
                
                {/* Player 2 Actions */}
                {canMakeGuess && (
                  <Box sx={{ mt: 3, p: 3, backgroundColor: '#e3f2fd', borderRadius: 2, border: '2px solid #2196f3' }}>
                    <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
                      🎯 Your Turn! Type your guess (5 letters)
                    </Typography>
                    <TextField
                      inputRef={inputRef}
                      label="Player 2 guess (5 letters)"
                      value={currentGuess}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
                        setCurrentGuess(value);
                      }}
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
                      sx={{ backgroundColor: '#2196f3', '&:hover': { backgroundColor: '#1976d2' } }}
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit P2 Guess'}
                    </Button>
                    <Typography variant="body2" sx={{ mt: 1, color: '#666' }}>
                      This will automatically verify Player 1's guess and make your guess
                    </Typography>
                  </Box>
                )}
                
                {!canMakeGuess && (
                  <Box sx={{ mt: 3, p: 3, backgroundColor: '#f5f5f5', borderRadius: 2 }}>
                    <Typography variant="h6" gutterBottom sx={{ color: '#666' }}>
                      ⏳ Waiting for Player 1...
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {state.gameState === GameState.P1_GUESS_TURN && "Player 1 is making their guess"}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Player 1's Opponent Board (Read-only) */}
              <Box sx={{ flex: 1, minWidth: 400, maxWidth: 600, opacity: 0.8 }}>
                <Typography variant="h5" align="center" sx={{ mb: 2, color: '#4caf50' }}>
                  🟩 Opponent's Board (Player 1)
                </Typography>
                
                <WordleBoard
                  guesses={opponentGuesses} // Show opponent's guesses (Player 1 when I'm Player 2)
                  currentWord="" // Never show opponent's current typing
                  isActive={false}
                  playerName=""
                />
                
                {/* 
                <Box sx={{ mt: 2, p: 2, backgroundColor: '#f0f0f0', borderRadius: 2, textAlign: 'center' }}>
                   <Typography variant="body2" sx={{ color: '#666' }}>
                    Guesses: {state.p1GuessCount.toString()}/6
                    {state.gameState === GameState.P1_GUESS_TURN && " • Currently guessing..."}
                    {state.gameState === GameState.P2_GUESS_TURN && " • Waiting for your move"}
                  </Typography> 
                </Box> 
                */}
              </Box>
            </Box>
          )}
          
          {/* Fallback - show debug info if player role detection fails */}
          {!(state.isPlayer1 === true && state.isPlayer2 !== true) && !(state.isPlayer2 === true && state.isPlayer1 !== true) && (
            <Box sx={{ p: 3, backgroundColor: '#ffebee', borderRadius: 2, maxWidth: 900, margin: 'auto' }}>
              <Typography variant="h6" color="error" align="center">
                ⚠️ Player Role Detection Failed
              </Typography>
              <Typography variant="body2" align="center">
                Player 1: {state.isPlayer1?.toString()}, Player 2: {state.isPlayer2?.toString()}
              </Typography>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default WordleGame;