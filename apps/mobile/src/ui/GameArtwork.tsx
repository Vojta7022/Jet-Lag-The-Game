import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from './theme.ts';

/** Original vector city map: decorative, never represents the live playable area. */
export function GameArtwork() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 480 360"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden={true}
    >
      <Rect width={480} height={360} fill="#E3EBDF" />
      <Path
        d="M315-10c-65 80 45 88-5 157s-9 119-75 222"
        stroke="#A8CDCE"
        strokeWidth={48}
        fill="none"
      />
      <G stroke="#FFFCF1" strokeWidth={13} fill="none">
        <Path d="M-10 80 490 290M-20 240 435-10M70-10l96 380M220-10l56 380M-10 310 490 80M-10 160 490 135" />
        <Path d="m400-10-73 380M-10 31l490 37" strokeWidth={7} />
      </G>
      <G fill="#A9C4A0">
        <Rect
          x={53}
          y={106}
          width={50}
          height={42}
          rx={7}
          transform="rotate(-18 53 106)"
        />
        <Rect x={362} y={190} width={66} height={48} rx={8} />
        <Rect x={181} y={260} width={45} height={55} rx={6} />
      </G>
      <Path
        d="M-15 270h90l70-75h74l57-58h73l66-65h80"
        stroke={colors.ink}
        strokeWidth={12}
        fill="none"
        strokeLinejoin="round"
      />
      <Path
        d="M-15 270h90l70-75h74l57-58h73l66-65h80"
        stroke={colors.signal}
        strokeWidth={6}
        fill="none"
        strokeLinejoin="round"
      />
      <Path
        d="M94-10v101l85 78v92l61 63v35"
        stroke={colors.hider}
        strokeWidth={7}
        strokeDasharray="9 7"
        fill="none"
      />
      {[
        { x: 75, y: 270 },
        { x: 145, y: 195 },
        { x: 219, y: 195 },
        { x: 276, y: 137 },
        { x: 349, y: 137 },
        { x: 415, y: 72 }
      ].map((p, i) => (
        <Circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={8}
          fill={colors.inkInverse}
          stroke={colors.ink}
          strokeWidth={3}
        />
      ))}
      <G transform="translate(252 66) rotate(-8)">
        <Rect width={125} height={42} rx={5} fill={colors.ink} />
        <SvgText
          x={62}
          y={27}
          fill={colors.inkInverse}
          fontSize={13}
          fontWeight="bold"
          textAnchor="middle"
          letterSpacing={2}
        >
          THE HUNT IS ON
        </SvgText>
      </G>
      <G transform="translate(126 164)">
        <Circle r={27} fill={colors.ink} />
        <Circle r={20} fill={colors.signal} />
        <Path d="M-7-1h14M0-8V6" stroke={colors.ink} strokeWidth={3} />
      </G>
      <G transform="translate(375 255)">
        <Circle r={30} fill={colors.seeker} />
        <Path
          d="m-11-11 22 22m0-22-22 22"
          stroke={colors.inkInverse}
          strokeWidth={5}
          strokeLinecap="round"
        />
      </G>
      <G transform="translate(29 27)">
        <Circle r={17} fill={colors.inkInverse} />
        <Path d="m0-12 5 17-5-3-5 3Z" fill={colors.ink} />
      </G>
    </Svg>
  );
}
