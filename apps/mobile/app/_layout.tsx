import 'react-native-get-random-values';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '../src/providers/AppProviders.tsx';

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center'
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Home' }} />
        <Stack.Screen name="auth" options={{ title: 'Session Entry' }} />
        <Stack.Screen name="create-match" options={{ title: 'Create Match' }} />
        <Stack.Screen name="join-match" options={{ title: 'Join Match' }} />
        <Stack.Screen name="lobby" options={{ title: 'Lobby' }} />
        <Stack.Screen name="map" options={{ title: 'Map Setup' }} />
        <Stack.Screen name="movement" options={{ title: 'Movement' }} />
        <Stack.Screen name="questions" options={{ title: 'Question Center' }} />
        <Stack.Screen name="cards" options={{ title: 'Cards' }} />
        <Stack.Screen name="chat" options={{ title: 'Chat' }} />
        <Stack.Screen name="admin" options={{ title: 'Admin / Debug' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="status" options={{ title: 'Status' }} />
      </Stack>
    </AppProviders>
  );
}
