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
            backgroundColor: '#F5F0E3'
          }
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Home', headerShown: false }} />
        <Stack.Screen name="auth" options={{ title: 'Player Profile' }} />
        <Stack.Screen name="create-match" options={{ title: 'Your Adventure' }} />
        <Stack.Screen name="join-match" options={{ title: 'Join Match' }} />
        <Stack.Screen name="lobby" options={{ title: 'The Briefing' }} />
        <Stack.Screen name="map" options={{ title: 'The Playing Field' }} />
        <Stack.Screen name="movement" options={{ title: 'Movement Review' }} />
        <Stack.Screen name="questions" options={{ title: 'The Investigation' }} />
        <Stack.Screen name="cards" options={{ title: 'Your Cards' }} />
        <Stack.Screen name="chat" options={{ title: 'Team Chat' }} />
        <Stack.Screen name="dice" options={{ title: 'Dice' }} />
        <Stack.Screen name="admin" options={{ title: 'Referee Panel' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Teams' }} />
        <Stack.Screen name="status" options={{ title: 'Match Controls' }} />
      </Stack>
    </AppProviders>
  );
}
