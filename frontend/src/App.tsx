// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useEffect, useState } from 'react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { MainLayout, WordleGameWrapper } from './components';
import { useDeployedBoardContext } from './hooks';
import { type BoardDeployment } from './contexts';
import { type Observable } from 'rxjs';

/**
 * Component to handle a specific game contract via URL
 */
const GameContract: React.FC = () => {
  const { contractAddress } = useParams<{ contractAddress: string }>();
  const boardApiProvider = useDeployedBoardContext();
  const [boardDeployment, setBoardDeployment] = useState<Observable<BoardDeployment> | null>(null);

  useEffect(() => {
    if (contractAddress) {
      console.log(`Auto-joining contract from URL: ${contractAddress}`);
      // Automatically join the contract specified in the URL
      const deployment = boardApiProvider.resolve(contractAddress);
      setBoardDeployment(deployment);
    }
  }, [contractAddress, boardApiProvider]);

  if (!boardDeployment) {
    return (
      <Box sx={{ background: '#000', minHeight: '100vh' }}>
        <MainLayout>
          <div>Loading contract {contractAddress}...</div>
        </MainLayout>
      </Box>
    );
  }

  return (
    <Box sx={{ background: '#000', minHeight: '100vh' }}>
      <MainLayout>
        <div data-testid={`wordle-game-${contractAddress}`}>
          <WordleGameWrapper boardDeployment$={boardDeployment} />
        </div>
      </MainLayout>
    </Box>
  );
};

/**
 * Component for the home page with ability to create new games
 */
const HomePage: React.FC = () => {
  const boardApiProvider = useDeployedBoardContext();
  const navigate = useNavigate();
  const [boardDeployments, setBoardDeployments] = useState<Array<Observable<BoardDeployment>>>([]);
  const [isCreatingGame, setIsCreatingGame] = useState(false);

  useEffect(() => {
    const subscription = boardApiProvider.boardDeployments$.subscribe(setBoardDeployments);
    return () => {
      subscription.unsubscribe();
    };
  }, [boardApiProvider]);

  const createNewGame = async () => {
    setIsCreatingGame(true);
    try {
      // Create a new contract deployment (no contractAddress = new deployment)
      const deployment = boardApiProvider.resolve();
      
      // Wait for deployment to complete and get contract address
      const subscription = deployment.subscribe((deploymentState) => {
        if (deploymentState.status === 'deployed') {
          const contractAddress = deploymentState.api.deployedContractAddress;
          console.log(`New game created with contract: ${contractAddress}`);
          
          // Redirect to the new game URL
          navigate(`/${contractAddress}`);
          subscription.unsubscribe();
        } else if (deploymentState.status === 'failed') {
          console.error('Failed to create game:', deploymentState.error);
          setIsCreatingGame(false);
          subscription.unsubscribe();
        }
      });
    } catch (error) {
      console.error('Error creating game:', error);
      setIsCreatingGame(false);
    }
  };

  return (
    <Box sx={{ background: '#000', minHeight: '100vh' }}>
      <MainLayout>
        {/* Show existing games */}
        {boardDeployments.map((boardDeployment, idx) => (
          <div data-testid={`wordle-game-${idx}`} key={`wordle-game-${idx}`}>
            <WordleGameWrapper boardDeployment$={boardDeployment} />
          </div>
        ))}
        
        {/* Show create new game option if no deployments exist */}
        {boardDeployments.length === 0 && (
          <div data-testid="wordle-game-start">
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <button 
                onClick={createNewGame} 
                disabled={isCreatingGame}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isCreatingGame ? 'not-allowed' : 'pointer',
                  opacity: isCreatingGame ? 0.6 : 1
                }}
              >
                {isCreatingGame ? 'Creating New Game...' : 'Create New Game'}
              </button>
            </Box>
            <WordleGameWrapper />
          </div>
        )}
      </MainLayout>
    </Box>
  );
};

/**
 * The root P2P Wordle application component with URL-based routing.
 *
 * @remarks
 * The {@link App} component supports:
 * - / - Home page with game creation
 * - /:contractAddress - Automatically join a specific game
 *
 * @internal
 */
const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/:contractAddress" element={<GameContract />} />
    </Routes>
  );
};

export default App;
