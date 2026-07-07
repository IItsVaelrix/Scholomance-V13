import { VideoAssetRecord } from './video-project-packet';

export function getOptimalAssetUrl(asset: VideoAssetRecord, isPreview: boolean): string {
  if (isPreview && asset.proxyUrl && asset.status === 'ready') {
    return asset.proxyUrl;
  }

  return asset.originalUrl || asset.url;
}
