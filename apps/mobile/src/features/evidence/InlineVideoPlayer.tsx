import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export function InlineVideoPlayer(props: { uri: string; headers?: Record<string, string>; height?: number }) {
  const player = useVideoPlayer({ uri: props.uri, headers: props.headers }, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  return <VideoView player={player} style={[styles.player, { height: props.height ?? 180 }]} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  player: { backgroundColor: '#111111', borderRadius: 12, width: '100%' }
});
