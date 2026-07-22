import './ConstellationPage.css';
import ConstellationBackdrop from './ConstellationBackdrop.jsx';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';

export default function ConstellationPage() {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div id="constellation-stage" className="constellation-stage" data-mode="idle">
      <ConstellationBackdrop reducedMotion={reducedMotion} />
      <div className="constellation-foreground">
        <h1 className="constellation-brand">ConstellationOS</h1>
      </div>
    </div>
  );
}
