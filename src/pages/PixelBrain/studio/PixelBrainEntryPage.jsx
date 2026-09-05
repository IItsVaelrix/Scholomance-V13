import { Navigate } from 'react-router-dom';

import PixelBrainPage from '../PixelBrainPage.jsx';
import {
  PIXELBRAIN_STUDIO_LEGACY_REDIRECT,
  PIXELBRAIN_STUDIO_V1,
} from './studio-flags.js';

export function shouldRedirectLegacy({
  studioEnabled = PIXELBRAIN_STUDIO_V1,
  legacyRedirect = PIXELBRAIN_STUDIO_LEGACY_REDIRECT,
} = {}) {
  return studioEnabled && legacyRedirect;
}

export default function PixelBrainEntryPage() {
  if (shouldRedirectLegacy()) return <Navigate to="/pixelbrain/studio/canvas" replace />;
  return <PixelBrainPage />;
}
