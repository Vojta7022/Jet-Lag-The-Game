import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShellProvider } from './AppShellProvider.tsx';
import { LocationSharingProvider } from './LocationSharingProvider.tsx';
import { RuntimeClientProvider } from './RuntimeClientProvider.tsx';
import { RuntimeModeProvider } from './RuntimeModeProvider.tsx';

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RuntimeModeProvider>
          <RuntimeClientProvider>
            <AppShellProvider>
              <LocationSharingProvider>
                {props.children}
              </LocationSharingProvider>
            </AppShellProvider>
          </RuntimeClientProvider>
        </RuntimeModeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
