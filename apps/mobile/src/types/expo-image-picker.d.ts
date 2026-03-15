declare module 'expo-image-picker' {
  export type MediaType = 'images' | 'videos' | 'livePhotos';

  export interface PermissionResponse {
    granted: boolean;
    canAskAgain: boolean;
    status: 'granted' | 'denied' | 'undetermined';
    expires: 'never';
  }

  export interface ImagePickerAsset {
    uri: string;
    mimeType?: string | null;
    fileName?: string | null;
    fileSize?: number;
    width: number;
    height: number;
  }

  export interface ImagePickerSuccessResult {
    canceled: false;
    assets: ImagePickerAsset[];
  }

  export interface ImagePickerCanceledResult {
    canceled: true;
    assets: null;
  }

  export type ImagePickerResult = ImagePickerSuccessResult | ImagePickerCanceledResult;

  export function requestMediaLibraryPermissionsAsync(): Promise<PermissionResponse>;
  export function requestCameraPermissionsAsync(): Promise<PermissionResponse>;
  export function launchImageLibraryAsync(options?: {
    mediaTypes?: MediaType | MediaType[];
    allowsEditing?: boolean;
    quality?: number;
    selectionLimit?: number;
  }): Promise<ImagePickerResult>;
  export function launchCameraAsync(options?: {
    mediaTypes?: MediaType | MediaType[];
    allowsEditing?: boolean;
    quality?: number;
  }): Promise<ImagePickerResult>;
}
