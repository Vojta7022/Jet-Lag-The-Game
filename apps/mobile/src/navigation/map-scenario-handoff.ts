export type ScenarioRouteParams = { scenario?: string | string[] };
export type ScenarioNavigationTarget = string | {
  pathname: '/create-match' | '/lobby' | '/map';
  params: { scenario: string };
};

function firstScenarioToken(value: string | string[] | undefined): string | undefined {
  const token = Array.isArray(value) ? value[0] : value;
  return token?.trim() || undefined;
}

export function buildLobbyRouteForMatch(scenario?: string | string[]): ScenarioNavigationTarget {
  const token = firstScenarioToken(scenario);
  return token ? { pathname: '/lobby', params: { scenario: token } } : '/lobby';
}

export function buildCreateMatchRouteFromScenario(scenario: string): ScenarioNavigationTarget {
  const token = firstScenarioToken(scenario);
  return token ? { pathname: '/create-match', params: { scenario: token } } : '/create-match';
}

export function buildMapRouteFromLobby(
  primaryNextRoute: string,
  scenario?: string | string[]
): ScenarioNavigationTarget {
  const token = firstScenarioToken(scenario);
  return primaryNextRoute === '/map' && token
    ? { pathname: '/map', params: { scenario: token } }
    : primaryNextRoute;
}
