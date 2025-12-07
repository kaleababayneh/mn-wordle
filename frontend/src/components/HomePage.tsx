import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, TextField, Typography, Paper, Snackbar, Alert } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useDeployedBoardContext } from '../hooks';

const StyledContainer = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(2),
  position: 'relative',
}));

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: theme.spacing(2),
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  maxWidth: 500,
  width: '100%',
  textAlign: 'center',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
}));

const StyledButton = styled(Button)(({ theme }) => ({
  padding: theme.spacing(1.5, 4),
  fontSize: '1.1rem',
  fontWeight: 600,
  borderRadius: theme.spacing(3),
  textTransform: 'none',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.3)',
  },
}));

const CreateGameButton = styled(StyledButton)(({ theme }) => ({
  background: 'linear-gradient(45deg, #4CAF50 30%, #66BB6A 90%)',
  color: 'white',
  marginBottom: theme.spacing(3),
  '&:hover': {
    background: 'linear-gradient(45deg, #45a049 30%, #5cb85c 90%)',
    transform: 'translateY(-2px)',
    boxShadow: '0 10px 20px rgba(76, 175, 80, 0.4)',
  },
  '&:disabled': {
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.5)',
  },
}));

const JoinGameButton = styled(StyledButton)(({ theme }) => ({
  background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
  color: 'white',
  '&:hover': {
    background: 'linear-gradient(45deg, #1976D2 30%, #1CB5E0 90%)',
    transform: 'translateY(-2px)',
    boxShadow: '0 10px 20px rgba(33, 150, 243, 0.4)',
  },
}));

const StyledTextField = styled(TextField)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  '& .MuiOutlinedInput-root': {
    borderRadius: theme.spacing(3),
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
    '& fieldset': {
      borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#2196F3',
    },
    '& input': {
      color: 'white',
    },
    '& input::placeholder': {
      color: 'rgba(255, 255, 255, 0.7)',
    },
  },
  '& .MuiInputLabel-root': {
    color: 'rgba(255, 255, 255, 0.7)',
    '&.Mui-focused': {
      color: '#2196F3',
    },
  },
}));

const HomePage: React.FC = () => {
  const boardApiProvider = useDeployedBoardContext();
  const navigate = useNavigate();
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [contractAddress, setContractAddress] = useState('');
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const createNewGame = async () => {
    setIsCreatingGame(true);
    try {
      // Create a new contract deployment
      const deployment = boardApiProvider.resolve();
      
      // Wait for deployment to complete and get contract address
      const subscription = deployment.subscribe((deploymentState) => {
        if (deploymentState.status === 'deployed') {
          const newContractAddress = deploymentState.api.deployedContractAddress;
          console.log(`New game created with contract: ${newContractAddress}`);
          
          // Redirect to the new game URL
          navigate(`/${newContractAddress}`);
          subscription.unsubscribe();
        } else if (deploymentState.status === 'failed') {
          console.error('Failed to create game:', deploymentState.error);
          setNotification({
            open: true,
            message: 'Failed to create new game. Please try again.',
            severity: 'error',
          });
          setIsCreatingGame(false);
          subscription.unsubscribe();
        }
      });
    } catch (error) {
      console.error('Error creating game:', error);
      setNotification({
        open: true,
        message: 'Error creating new game. Please try again.',
        severity: 'error',
      });
      setIsCreatingGame(false);
    }
  };

  const joinGame = () => {
    if (!contractAddress.trim()) {
      setNotification({
        open: true,
        message: 'Please enter a contract address.',
        severity: 'error',
      });
      return;
    }

    // Validate contract address format (basic validation)
    // Contract addresses should be hexadecimal strings of reasonable length
    const contractAddressRegex = /^[a-fA-F0-9]{40,}$/;
    if (!contractAddressRegex.test(contractAddress.trim())) {
      setNotification({
        open: true,
        message: 'Please enter a valid contract address (hexadecimal string, at least 40 characters).',
        severity: 'error',
      });
      return;
    }

    // Navigate to the game
    navigate(`/${contractAddress.trim()}`);
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  return (
    <StyledContainer>
      {/* Add logo background similar to other pages */}
      <Box
        component="img"
        src="/logo-render.png"
        alt="logo-image"
        sx={{
          position: 'absolute',
          zIndex: 1,
          left: '2vw',
          top: '5vh',
          height: 607,
          opacity: 0.3,
        }}
      />
      
      <StyledPaper elevation={24} sx={{ zIndex: 999, position: 'relative' }}>
        <Typography 
          variant="h3" 
          component="h1" 
          gutterBottom 
          sx={{ 
            fontWeight: 700,
            color: 'white',
            marginBottom: 3,
          }}
        >
          Midnight Wordle
        </Typography>
        
        <Typography 
          variant="subtitle1" 
          gutterBottom 
          sx={{ 
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: 4,
            fontSize: '1.1rem',
          }}
        >
          Play Wordle with friends in a decentralized way
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CreateGameButton
            onClick={createNewGame}
            disabled={isCreatingGame}
            fullWidth
            size="large"
          >
            {isCreatingGame ? 'Creating New Game...' : 'Create New Game'}
          </CreateGameButton>

          <Typography 
            variant="body1" 
            sx={{ 
              color: 'rgba(255, 255, 255, 0.8)',
              margin: '16px 0',
              fontWeight: 500,
            }}
          >
            OR
          </Typography>

          <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <StyledTextField
              fullWidth
              label="Enter Contract Address"
              placeholder="Paste contract address here..."
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  joinGame();
                }
              }}
            />
            
            <JoinGameButton
              onClick={joinGame}
              fullWidth
              size="large"
            >
              Join Game
            </JoinGameButton>
          </Box>
        </Box>
      </StyledPaper>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity} 
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </StyledContainer>
  );
};

export default HomePage;