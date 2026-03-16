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
          headerTintColor: '#13212f',
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '700'
          },
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: '#f4f6f8'
          }
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Home' }} />
        <Stack.Screen name="auth" options={{ title: 'Profile' }} />
        <Stack.Screen name="create-match" options={{ title: 'Create Match' }} />
        <Stack.Screen name="join-match" options={{ title: 'Join Match' }} />
        <Stack.Screen name="lobby" options={{ title: 'Match Room' }} />
        <Stack.Screen name="map" options={{ title: 'Live Map' }} />
        <Stack.Screen name="movement" options={{ title: 'Movement' }} />
        <Stack.Screen name="questions" options={{ title: 'Questions' }} />
        <Stack.Screen name="cards" options={{ title: 'Deck' }} />
        <Stack.Screen name="chat" options={{ title: 'Chat' }} />
        <Stack.Screen name="dice" options={{ title: 'Dice' }} />
        <Stack.Screen name="admin" options={{ title: 'Referee Tools' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Team' }} />
        <Stack.Screen name="status" options={{ title: 'Connection Details' }} />
      </Stack>
    </AppProviders>
  );
}
