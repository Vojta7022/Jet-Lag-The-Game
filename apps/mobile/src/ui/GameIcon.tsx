import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from './theme.ts';

export type GameIconName =
  | 'map'
  | 'questions'
  | 'deck'
  | 'chat'
  | 'dice'
  | 'hider'
  | 'seeker'
  | 'arrow';

export function GameIcon({
  name,
  size = 24,
  color = colors.text
}: {
  name: GameIconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      {name === 'map' ? (
        <>
          <Path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" />
          <Path d="M9 3v16M15 5v16" />
        </>
      ) : null}
      {name === 'questions' || name === 'seeker' ? (
        <>
          <Circle cx={10} cy={10} r={6} />
          <Path d="m15 15 6 6" />
          {name === 'questions' ? (
            <Path d="M8.5 8a1.6 1.6 0 0 1 3 1c0 1-1.5 1-1.5 2M10 13.5v.1" />
          ) : null}
        </>
      ) : null}
      {name === 'deck' ? (
        <>
          <Rect x={6} y={3} width={14} height={17} rx={2} />
          <Path d="M3 7v14h12m-2-14 3 4-3 4-3-4Z" />
        </>
      ) : null}
      {name === 'chat' ? (
        <>
          <Path d="M4 4h16v12H9l-5 4Z" />
          <Path d="M8 8h8M8 12h5" />
        </>
      ) : null}
      {name === 'dice' ? (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={4} />
          <Circle cx={8} cy={8} r={0.7} />
          <Circle cx={16} cy={8} r={0.7} />
          <Circle cx={12} cy={12} r={0.7} />
          <Circle cx={8} cy={16} r={0.7} />
          <Circle cx={16} cy={16} r={0.7} />
        </>
      ) : null}
      {name === 'hider' ? (
        <>
          <Path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" />
          <Circle cx={12} cy={12} r={3} />
          <Path d="m3 21 18-18" />
        </>
      ) : null}
      {name === 'arrow' ? <Path d="M4 12h16m-6-6 6 6-6 6" /> : null}
    </Svg>
  );
}
