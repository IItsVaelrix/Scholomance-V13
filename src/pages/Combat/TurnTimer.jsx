import { motion } from 'framer-motion';

const DEFAULT_TURN_TIME_SECONDS = 90;

export default function TurnTimer({ timeRemaining, isActive: _isActive, isCompact = false }) {
  const isUrgent = timeRemaining < 5;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeRemaining / DEFAULT_TURN_TIME_SECONDS));
  const offset = circumference * (1 - progress);

  return (
    <div className={`turn-timer-wrapper ${isCompact ? 'is-compact' : ''}`}>
      <svg className={`turn-timer-arc ${isUrgent ? 'is-urgent' : ''}`} viewBox="0 0 40 40">
        <circle
          className="timer-track"
          cx="20"
          cy="20"
          r={radius}
        />
        <motion.circle
          className="timer-fill"
          cx="20"
          cy="20"
          r={radius}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      {!isCompact && <span className="timer-text">{timeRemaining}s</span>}
    </div>
  );
}
