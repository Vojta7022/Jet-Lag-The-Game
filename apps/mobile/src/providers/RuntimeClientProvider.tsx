import { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View } from 'react-native';

import { mobileAppEnvironment } from '../config/env.ts';
import { bundledContentPacks, defaultContentPack } from '../runtime/default-content-pack.ts';
import { AsyncStorageRuntimePersistence } from '../runtime/local-session-storage.ts';
import { MobileRuntimeOrchestrator } from '../runtime/mobile-runtime-orchestrator.ts';
import { ContentPackCatalog } from '../runtime/content-pack-catalog.ts';

const RuntimeClientContext = createContext<MobileRuntimeOrchestrator | undefined>(undefined);

export function RuntimeClientProvider(props: { children: React.ReactNode }) {
  const orchestratorRef = useRef<MobileRuntimeOrchestrator | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);

  if (!orchestratorRef.current) {
    orchestratorRef.current = new MobileRuntimeOrchestrator({
      contentPacks: bundledContentPacks,
      contentPack: defaultContentPack,
      environment: mobileAppEnvironment,
      singleDevicePersistence: new AsyncStorageRuntimePersistence(),
      contentPackCatalog: new ContentPackCatalog(AsyncStorage)
    });
  }

  useEffect(() => {
    let mounted = true;
    void orchestratorRef.current!.restoreInstalledContentPacks().catch(() => {
      // A corrupt saved extension must not prevent the bundled base game from opening.
    }).finally(() => {
      if (mounted) setCatalogReady(true);
    });
    return () => { mounted = false; };
  }, []);

  if (!catalogReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4efe3' }}>
        <Text style={{ color: '#27251f', fontSize: 16 }}>Preparing your game library…</Text>
      </View>
    );
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
