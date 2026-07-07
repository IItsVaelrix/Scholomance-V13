import { motion, AnimatePresence } from 'framer-motion';
import SigilEntity from '../SigilEntity.jsx';
import './EnemyDetailsModal.css';

const INK_INITIAL = { opacity: 0, filter: "blur(2.5px) brightness(0.5)", y: 8 };
const INK_ANIMATE = {
  opacity: 1,
  filter: ["blur(2px) brightness(0.55)", "blur(0px) brightness(1)"],
  y: 0,
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
};

export default function EnemyDetailsModal({ isOpen, onClose, enemy, latestTurn = null }) {
  if (!enemy) return null;

  const doctrineTraits = Array.isArray(enemy.doctrine?.traits) ? enemy.doctrine.traits : [];
  const doctrineMoves = Array.isArray(enemy.doctrine?.signatureMoves) ? enemy.doctrine.signatureMoves : [];
  const activeEffects = Array.isArray(enemy.statusEffects) ? enemy.statusEffects : [];
  const counterTokens = Array.isArray(enemy.counterTokens)
    ? enemy.counterTokens.slice(0, 4)
    : Array.isArray(latestTurn?.counterTokens)
      ? latestTurn.counterTokens.slice(0, 4)
      : [];
  const syntacticProfile = enemy.syntacticProfile || null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="enemy-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="enemy-modal-container"
            initial={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
          >
            <div className="enemy-modal-frame">
              <button className="enemy-modal-close" onClick={onClose}>✕</button>

              <div className="enemy-modal-inner">
                {/* Header: Sigil + Name */}
                <div className="enemy-header-section">
                  <div className="enemy-sigil-chamber">
                    <SigilEntity
                      school={enemy.school}
                      effectClass={enemy.bytecodeEffectClass}
                      glowIntensity={0.8}
                      size={120}
                    />
                  </div>
                  <motion.div className="enemy-title-block" initial={INK_INITIAL} animate={INK_ANIMATE}>
                    <h2 className="enemy-modal-name">{enemy.name.toUpperCase()}</h2>
                    <div className="enemy-modal-school-badge">{enemy.school} ARCHETYPE</div>
                  </motion.div>
                </div>

                {/* Stats Grid */}
                <div className="enemy-stats-grid">
                  <StatRow label="ESSENCE (HP)" value={`${enemy.hp} / ${enemy.maxHp}`} color="#22aa44" />
                  <StatRow label="RESONANCE (MP)" value={`${enemy.mp} / ${enemy.maxMp}`} color="#2196f3" />
                  <StatRow label="INTELLIGENCE" value={enemy.int || 15} color="var(--gold)" />
                  <StatRow label="WILL" value={enemy.will || 12} color="var(--battle-accent)" />
                </div>

                {/* Traits & Abilities */}
                <div className="enemy-details-sections">
                  <section className="detail-section">
                    <h3 className="section-title">LINGUISTIC TRAITS</h3>
                    <ul className="trait-list">
                      {doctrineTraits.length > 0 ? (
                        doctrineTraits.map((trait) => (
                          <li key={trait}>• {trait}</li>
                        ))
                      ) : (
                        <>
                          <li>• Phonetic Predator: Targets resonant vowel families.</li>
                          <li>• Prosodic Interference: Scales threat with player skill.</li>
                          <li>• Affinity: {enemy.school} resonance shapes the counter-verse.</li>
                        </>
                      )}
                    </ul>
                  </section>

                  {syntacticProfile && (
                    <section className="detail-section">
                      <h3 className="section-title">SYMBOLIC STRUCTURE</h3>
                      <ul className="trait-list">
                        <li>• Body: {syntacticProfile.symbolicBody?.join(', ')}</li>
                        <li>• Known Weaknesses: {syntacticProfile.weaknessFamilies?.join(', ')}</li>
                        <li>• Resists: {syntacticProfile.resistanceFamilies?.join(', ')}</li>
                        <li>• Favored Devices: {syntacticProfile.favoredDevices?.join(', ')}</li>
                      </ul>
                    </section>
                  )}

                  <section className="detail-section">
                    <h3 className="section-title">SIGNATURE MOVES</h3>
                    {(enemy.signatureMove || doctrineMoves.length > 0) ? (
                      <>
                        {(enemy.signatureMove ? [enemy.signatureMove] : doctrineMoves).slice(0, 2).map((move) => (
                          <div className="ability-card" key={move.name || move.label}>
                            <span className="ability-name">{move.name || move.label}</span>
                            <p className="ability-desc">{move.telegraph || move.flavor || 'A doctrine-shaped counter technique.'}</p>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="ability-card">
                        <span className="ability-name">Void Pulse</span>
                        <p className="ability-desc">Emits a hollowing wave across 3 radial cells.</p>
                      </div>
                    )}
                  </section>

                  <section className="detail-section">
                    <h3 className="section-title">CURRENT TELEGRAPH</h3>
                    <div className="ability-card">
                      <span className="ability-name">{enemy.telegraph?.label || latestTurn?.telegraph?.label || 'No telegraph active'}</span>
                      <p className="ability-desc">{enemy.telegraph?.summary || latestTurn?.telegraph?.summary || 'The opponent is between declarations.'}</p>
                    </div>
                    {counterTokens.length > 0 && (
                      <p className="ability-desc">Counter tokens: {counterTokens.join(', ')}</p>
                    )}
                  </section>

                  <section className="detail-section">
                    <h3 className="section-title">ACTIVE STATUS</h3>
                    {activeEffects.length > 0 ? (
                      <ul className="trait-list">
                        {activeEffects.map((effect) => (
                          <li key={`${effect.chainId || effect.id}-${effect.turnsRemaining}`}>
                            • {effect.label || effect.id}
                            {effect.turnsRemaining ? ` · ${effect.turnsRemaining}T` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ability-desc">No active status effects are binding this entity.</p>
                    )}
                  </section>
                </div>

                <div className="enemy-modal-footer">
                  LATENT BYTECODE: {enemy.bytecodeEffectClass} · DOCTRINE {enemy.doctrine?.id || 'UNBOUND'}
                </div>
              </div>

              {/* Corner Ornaments */}
              <div className="modal-corner tl" /><div className="modal-corner tr" />
              <div className="modal-corner bl" /><div className="modal-corner br" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color }}>{value}</span>
    </div>
  );
}
