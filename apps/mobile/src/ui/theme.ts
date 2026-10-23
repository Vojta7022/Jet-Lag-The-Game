import { Platform } from 'react-native';

export const colors = {
  background: '#F5F0E3',
  surface: '#FFFCF3',
  surfaceMuted: '#EAE5D7',
  surfaceRaised: '#FFFEF8',
  border: '#D9D4C5',
  borderStrong: '#9DA9A7',
  text: '#102E43',
  textMuted: '#53676C',
  textSubtle: '#6D7C7C',
  accent: '#007C80',
  accentStrong: '#005F65',
  accentMuted: '#DCEEE7',
  accentWarm: '#D94819',
  accentWarmMuted: '#FBE4D5',
  danger: '#AB342C',
  dangerMuted: '#FAE3DC',
  success: '#246746',
  successMuted: '#E0EFE2',
  warning: '#845500',
  warningMuted: '#FFF0B5',
  inkInverse: '#FFFCF1',
  signal: '#FFD447',
  ink: '#102E43',
  hider: '#007C80',
  seeker: '#D94819'
};

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', web: 'Georgia, serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', web: 'monospace' })
};
