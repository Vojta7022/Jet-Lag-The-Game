export interface RegionSearchRequestState {
  draftQuery: string;
  requestQuery: string;
  requestId: number;
}

export function createRegionSearchRequestState(initialQuery = ''): RegionSearchRequestState {
  return {
    draftQuery: initialQuery,
    requestQuery: '',
    requestId: 0
  };
}

export function editRegionSearchQuery(
  state: RegionSearchRequestState,
  draftQuery: string
): RegionSearchRequestState {
  return { ...state, draftQuery };
}

export function submitRegionSearchQuery(state: RegionSearchRequestState): RegionSearchRequestState {
  const requestQuery = state.draftQuery.trim();
  if (requestQuery.length < 2) return state;
  return {
    ...state,
    requestQuery,
    requestId: state.requestId + 1
  };
}
