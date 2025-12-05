import React, { useEffect, useState } from 'react';
import { type Observable } from 'rxjs';
import WordleGame from './WordleGame';
import { type BoardDeployment } from '../contexts';
import { type WordleDerivedState, type DeployedWordleAPI } from '../../../api/src/index';
import { useDeployedBoardContext } from '../hooks';
import { Card, CardContent, CardHeader, Button, Box, TextField, Typography, CircularProgress, Alert } from '@mui/material';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';

interface WordleGameWrapperProps {
  boardDeployment$?: Observable<BoardDeployment>;
}

const WordleGameWrapper: React.FC<WordleGameWrapperProps> = ({ boardDeployment$ }) => {
  const [api, setApi] = useState<DeployedWordleAPI | undefined>(undefined);
  const [state, setState] = useState<WordleDerivedState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [contractAddress, setContractAddress] = useState('');
  const [showDeployOptions, setShowDeployOptions] = useState(!boardDeployment$);
  const [error, setError] = useState<string | null>(null);
  
  const boardApiProvider = useDeployedBoardContext();

  useEffect(() => {
    if (!boardDeployment$) {
      setShowDeployOptions(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    const subscription = boardDeployment$.subscribe((deployment) => {
      console.log('Deployment status update:', deployment.status);
      
      if (deployment.status === 'deployed') {
        console.log('Setting API:', deployment.api);
        setApi(deployment.api);
        setIsLoading(false);
        setShowDeployOptions(false);
        setError(null);
        
        // Subscribe to state changes with error handling
        const stateSubscription = deployment.api.state$.subscribe({
          next: (newState) => {
            console.log('State update:', newState);
            setState(newState);
          },
          error: (err) => {
            console.error('State subscription error:', err);
            setError(`State error: ${err.message || 'Unknown error'}`);
          }
        });

        return () => {
          stateSubscription.unsubscribe();
        };
      } else if (deployment.status === 'failed') {
        console.error('Deployment failed:', deployment.error);
        setIsLoading(false);
        setShowDeployOptions(true);
        setError(`Deployment failed: ${deployment.error.message}`);
      } else {
        // in-progress
        setIsLoading(true);
        setShowDeployOptions(false);
        setError(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [boardDeployment$]);

  const handleDeploy = () => {
    console.log('Starting deployment...');
    setIsLoading(true);
    setError(null);
    
    try {
      const deployment$ = boardApiProvider.resolve();
      
      const subscription = deployment$.subscribe({
        next: (deployment) => {
          console.log('Deploy subscription update:', deployment);
          
          if (deployment.status === 'deployed') {
            console.log('Deployment successful, setting API');
            setApi(deployment.api);
            setIsLoading(false);
            setShowDeployOptions(false);
            setError(null);
            
            // Subscribe to state changes
            const stateSubscription = deployment.api.state$.subscribe({
              next: (newState) => {
                console.log('State update after deploy:', newState);
                setState(newState);
              },
              error: (err) => {
                console.error('State subscription error after deploy:', err);
                setError(`State error: ${err.message || 'Unknown error'}`);
              }
            });

            return () => {
              stateSubscription.unsubscribe();
            };
          } else if (deployment.status === 'failed') {
            console.error('Deploy failed:', deployment.error);
            setIsLoading(false);
            setShowDeployOptions(true);
            setError(`Deployment failed: ${deployment.error.message}`);
          }
        },
        error: (err) => {
          console.error('Deploy subscription error:', err);
          setIsLoading(false);
          setShowDeployOptions(true);
          setError(`Deployment error: ${err.message || 'Unknown error'}`);
        }
      });
    } catch (err) {
      console.error('Deploy error:', err);
      setIsLoading(false);
      setError(`Error starting deployment: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleJoin = () => {
    if (!contractAddress) return;
    
    console.log('Starting join for contract:', contractAddress);
    setIsLoading(true);
    setError(null);
    
    try {
      const deployment$ = boardApiProvider.resolve(contractAddress as ContractAddress);
      
      const subscription = deployment$.subscribe({
        next: (deployment) => {
          console.log('Join subscription update:', deployment);
          
          if (deployment.status === 'deployed') {
            console.log('Join successful, setting API');
            setApi(deployment.api);
            setIsLoading(false);
            setShowDeployOptions(false);
            setError(null);
            
            // Subscribe to state changes
            const stateSubscription = deployment.api.state$.subscribe({
              next: (newState) => {
                console.log('State update after join:', newState);
                setState(newState);
              },
              error: (err) => {
                console.error('State subscription error after join:', err);
                setError(`State error: ${err.message || 'Unknown error'}`);
              }
            });

            return () => {
              stateSubscription.unsubscribe();
            };
          } else if (deployment.status === 'failed') {
            console.error('Join failed:', deployment.error);
            setIsLoading(false);
            setShowDeployOptions(true);
            setError(`Join failed: ${deployment.error.message}`);
          }
        },
        error: (err) => {
          console.error('Join subscription error:', err);
          setIsLoading(false);
          setShowDeployOptions(true);
          setError(`Join error: ${err.message || 'Unknown error'}`);
        }
      });
    } catch (err) {
      console.error('Join error:', err);
      setIsLoading(false);
      setError(`Error joining game: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (showDeployOptions && !isLoading) {
    return (
      <Card sx={{ maxWidth: 600, margin: 'auto', mt: 4 }}>
        <CardHeader title="P2P ZK Wordle" subheader="Deploy a new game or join an existing one" />
        <CardContent>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Create New Game
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                Deploy a new P2P Wordle contract to start a new game.
              </Typography>
              <Button variant="contained" onClick={handleDeploy} disabled={isLoading}>
                Deploy New Game
              </Button>
            </Box>
            
            <Box>
              <Typography variant="h6" gutterBottom>
                Join Existing Game
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                Enter the contract address of an existing game to join.
              </Typography>
              <TextField
                fullWidth
                label="Contract Address"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                sx={{ mb: 2 }}
                placeholder="Enter contract address to join"
              />
              <Button 
                variant="outlined" 
                onClick={handleJoin} 
                disabled={isLoading || !contractAddress}
              >
                Join Game
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card sx={{ maxWidth: 600, margin: 'auto', mt: 4 }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>
            {api ? 'Loading game state...' : 'Setting up game...'}
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return <WordleGame api={api} state={state} isLoading={isLoading} />;
};

export default WordleGameWrapper;