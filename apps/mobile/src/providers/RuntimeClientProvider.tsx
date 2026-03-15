import { createContext, useContext, useRef } from 'react';

import { mobileAppEnvironment } from '../config/env.ts';
import { defaultContentPack } from '../runtime/default-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../runtime/mobile-runtime-orchestrator.ts';

const RuntimeClientContext = createContext<MobileRuntimeOrchestrator | undefined>(undefined);

export function RuntimeClientProvider(props: { children: React.ReactNode }) {
  const orchestratorRef = useRef<MobileRuntimeOrchestrator | null>(null);

  if (!orchestratorRef.current) {
    orchestratorRef.current = new MobileRuntimeOrchestrator({
      contentPack: defaultContentPack,
      environment: mobileAppEnvironment
    });
  }

  return (
    <RuntimeClientContext.Provider value={orchestratorRef.current}>
      {props.children}
    </RuntimeClientContext.Provider>
  );
}

export function useRuntimeClient() {
  const context = useContext(RuntimeClientContext);
  if (!context) {
    throw new Error('useRuntimeClient must be used inside RuntimeClientProvider.');
  }

  return context;
}
