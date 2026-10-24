import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MapScenario } from './map-scenarios.ts';

const MAP_SCENARIOS_KEY = 'jet-lag-game:v1:map-scenarios';

export async function loadSavedMapScenarios(): Promise<MapScenario[]> {
  const value = await AsyncStorage.getItem(MAP_SCENARIOS_KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as MapScenario[];
    return Array.isArray(parsed) ? parsed.filter((scenario) => scenario.version === 1) : [];
  } catch {
    return [];
  }
}

export async function saveMapScenario(scenario: MapScenario): Promise<MapScenario[]> {
  const current = await loadSavedMapScenarios();
  const next = [scenario, ...current.filter((saved) => saved.name !== scenario.name)].slice(0, 30);
  await AsyncStorage.setItem(MAP_SCENARIOS_KEY, JSON.stringify(next));
  return next;
}
