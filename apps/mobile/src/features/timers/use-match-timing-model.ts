import { useEffect, useMemo, useState } from 'react';

import type { MatchProjection } from '../../../../../packages/shared-types/src/index.ts';

import { buildMatchTimingDisplayModel } from './timer-model.ts';

function useLiveNow(enabled: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      setNowMs(Date.now());
      return undefined;
    }

    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled]);

  return nowMs;
}

export function useMatchTimingModel(
  projection: MatchProjection | undefined,
  syncGeneratedAt: string | undefined
) {
  const needsLiveRefresh = Boolean(
    projection?.paused ||
    projection?.visibleTimers.some((timer) => timer.status === 'running')
  );
  const nowMs = useLiveNow(needsLiveRefresh);

  return useMemo(
    () =>
      buildMatchTimingDisplayModel({
        projection,
        syncGeneratedAt,
        nowMs
      }),
    [nowMs, projection, syncGeneratedAt]
  );
}
