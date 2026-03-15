import { StateBanner } from '../../ui/StateBanner.tsx';

import type { MatchTimingDisplayModel } from './timer-model.ts';

interface MatchTimingBannerProps {
  model: MatchTimingDisplayModel | undefined;
}

export function MatchTimingBanner(props: MatchTimingBannerProps) {
  if (!props.model?.banner) {
    return null;
  }

  return (
    <StateBanner
      tone={props.model.banner.tone}
      title={props.model.banner.title}
      detail={props.model.banner.detail}
    />
  );
}
