import type { SelectedMediaAsset } from './evidence-model.ts';

export type MediaSelectionResult =
  | {
      status: 'selected';
      asset: SelectedMediaAsset;
    }
  | {
      status: 'cancelled';
    }
  | {
      status: 'permission_denied' | 'unavailable' | 'error';
      title: string;
      detail: string;
    };

async function loadImagePickerModule(): Promise<typeof import('expo-image-picker') | undefined> {
  try {
    return await import('expo-image-picker');
  } catch {
    return undefined;
  }
}

export function describeUnavailablePicker(channel: 'library' | 'camera'): MediaSelectionResult {
  const surface = channel === 'camera' ? 'camera capture' : 'photo library';

  return {
    status: 'unavailable',
    title: `${channel === 'camera' ? 'Camera' : 'Image picker'} unavailable`,
    detail:
      `This build does not currently include Expo Image Picker for ${surface}. ` +
      'Install mobile dependencies, restart Expo, and rebuild the native app or dev client if native modules changed.'
  };
}

function normalizeAsset(
  asset: import('expo-image-picker').ImagePickerAsset,
  source: SelectedMediaAsset['source']
): SelectedMediaAsset {
  return {
    uri: asset.uri,
    source,
    mimeType: asset.mimeType ?? undefined,
    fileName: asset.fileName ?? undefined,
    width: asset.width,
    height: asset.height,
    fileSizeBytes: asset.fileSize
  };
}

export async function pickImageFromLibrary(): Promise<MediaSelectionResult> {
  const imagePicker = await loadImagePickerModule();
  if (!imagePicker) {
    return describeUnavailablePicker('library');
  }

  const permission = await imagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      status: 'permission_denied',
      title: 'Photo library access denied',
      detail: 'Allow photo-library access to choose an image from this device.'
    };
  }

  try {
    const result = await imagePicker.launchImageLibraryAsync({
      mediaTypes: imagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      selectionLimit: 1
    });

    if (result.canceled || !result.assets?.[0]) {
      return { status: 'cancelled' };
    }

    return {
      status: 'selected',
      asset: normalizeAsset(result.assets[0], 'library')
    };
  } catch (error) {
    return {
      status: 'error',
      title: 'Could not open the photo library',
      detail: error instanceof Error ? error.message : 'The photo library request failed.'
    };
  }
}

export async function captureImageWithCamera(): Promise<MediaSelectionResult> {
  const imagePicker = await loadImagePickerModule();
  if (!imagePicker) {
    return describeUnavailablePicker('camera');
  }

  const permission = await imagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return {
      status: 'permission_denied',
      title: 'Camera access denied',
      detail: 'Allow camera access to take a photo on this device.'
    };
  }

  try {
    const result = await imagePicker.launchCameraAsync({
      mediaTypes: imagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9
    });

    if (result.canceled || !result.assets?.[0]) {
      return { status: 'cancelled' };
    }

    return {
      status: 'selected',
      asset: normalizeAsset(result.assets[0], 'camera')
    };
  } catch (error) {
    return {
      status: 'error',
      title: 'Could not open the camera',
      detail: error instanceof Error ? error.message : 'The camera request failed.'
    };
  }
}
