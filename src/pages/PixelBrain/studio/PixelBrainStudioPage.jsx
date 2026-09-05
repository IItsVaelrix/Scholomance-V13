import { Navigate, useNavigate, useParams } from 'react-router-dom';

import PixelBrainPage from '../PixelBrainPage.jsx';
import { PIXELBRAIN_STUDIO_V1 } from './studio-flags.js';
import { normalizeStudioTab } from './studio-tabs.js';

export default function PixelBrainStudioPage() {
  const navigate = useNavigate();
  const { studioTab } = useParams();
  const activeTab = normalizeStudioTab(studioTab);

  if (!PIXELBRAIN_STUDIO_V1) {
    return <Navigate to="/pixelbrain" replace />;
  }

  return (
    <PixelBrainPage
      studioEnabled
      studioTab={activeTab}
      onStudioTabChange={(nextTab) => navigate(`/pixelbrain/studio/${normalizeStudioTab(nextTab)}`)}
    />
  );
}
