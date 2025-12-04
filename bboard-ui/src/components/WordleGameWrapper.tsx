import React, { useEffect, useState } from 'react';
import { type Observable } from 'rxjs';
import WordleGame from './WordleGame';
import { type BoardDeployment } from '../contexts';
import { type WordleDerivedState, type DeployedWordleAPI } from '../../../api/src/index';

interface WordleGameWrapperProps {
  boardDeployment$?: Observable<BoardDeployment>;
}

const WordleGameWrapper: React.FC<WordleGameWrapperProps> = ({ boardDeployment$ }) => {
  const [api, setApi] = useState<DeployedWordleAPI | undefined>(undefined);
  const [state, setState] = useState<WordleDerivedState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!boardDeployment$) {
      return;
    }

    setIsLoading(true);
    
    const subscription = boardDeployment$.subscribe((deployment) => {
      if (deployment.status === 'deployed') {
        setApi(deployment.api);
        setIsLoading(false);
        
        // Subscribe to state changes
        const stateSubscription = deployment.api.state$.subscribe((newState) => {
          setState(newState);
        });

        return () => {
          stateSubscription.unsubscribe();
        };
      } else if (deployment.status === 'failed') {
        console.error('Deployment failed:', deployment.error);
        setIsLoading(false);
      } else {
        // in-progress
        setIsLoading(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [boardDeployment$]);

  return <WordleGame api={api} state={state} isLoading={isLoading} />;
};

export default WordleGameWrapper;