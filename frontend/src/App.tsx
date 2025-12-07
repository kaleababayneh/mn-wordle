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
import { Routes, Route, useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { MainLayout, WordleGameWrapper, HomePage } from './components';
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
