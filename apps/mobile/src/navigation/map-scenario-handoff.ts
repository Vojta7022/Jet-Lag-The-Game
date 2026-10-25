export type ScenarioRouteParams = { scenario?: string | string[] };
export type ScenarioRoutePath = '/create-match' | '/dashboard' | '/lobby' | '/map';
export type ScenarioNavigationTarget = string | {
  pathname: ScenarioRoutePath;
  params: { scenario: string };
};

function firstScenarioToken(value: string | string[] | undefined): string | undefined {
  const token = Array.isArray(value) ? value[0] : value;
  return token?.trim() || undefined;
}

export function buildLobbyRouteForMatch(scenario?: string | string[]): ScenarioNavigationTarget {
  return buildScenarioRoute('/lobby', scenario);
}

export function buildCreateMatchRouteFromScenario(scenario: string): ScenarioNavigationTarget {
  return buildScenarioRoute('/create-match', scenario);
}

export function buildScenarioRoute(
  pathname: ScenarioRoutePath,
  scenario?: string | string[]
): ScenarioNavigationTarget {
  const token = firstScenarioToken(scenario);
  return token ? { pathname, params: { scenario: token } } : pathname;
}
