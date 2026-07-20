import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './InventoryOverlay.module.css';
import { getInventorySnapshot, setInventorySnapshot } from '../../game/inventory/inventoryService.js';
import { inventorySlotOf } from '../../data/itemDatabase.js';

// Using the recently compiled IdealHuman PNG for the character preview
const CHARACTER_IMAGE_URL = '/generated-assets/IdealHuman/IdealHuman-png.png';

const EQUIPMENT_SLOTS = [
  { id: 'head', label: 'Head', pos: 'head' },
  { id: 'amulet', label: 'Amulet', pos: 'amulet' },
  { id: 'shoulder', label: 'Shoulder', pos: 'shoulder' },
  { id: 'chest', label: 'Chest', pos: 'chest' },
  { id: 'weapon', label: 'Weapon', pos: 'weapon' },
  { id: 'offhand', label: 'Offhand', pos: 'offhand' },
  { id: 'ring1', label: 'Ring', pos: 'ring1' },
  { id: 'ring2', label: 'Ring', pos: 'ring2' },
  { id: 'legs', label: 'Legs', pos: 'legs' },
  { id: 'boots', label: 'Boots', pos: 'boots' },
];

const MODEL_ANCHORS = {
  head: { top: '15%', left: '50%', scale: 0.35 },
  chest: { top: '38%', left: '50%', scale: 0.45 },
  legs: { top: '65%', left: '50%', scale: 0.45 },
  boots: { top: '85%', left: '50%', scale: 0.35 },
  weapon: { top: '45%', left: '75%', scale: 0.65 },
  offhand: { top: '45%', left: '25%', scale: 0.5 },
  amulet: { top: '25%', left: '50%', scale: 0.2 },
  ring1: { top: '55%', left: '30%', scale: 0.15 },
  ring2: { top: '55%', left: '70%', scale: 0.15 },
};

export function InventoryOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [inventory, setInventory] = useState(() => getInventorySnapshot().slots);
  const [equipped, setEquipped] = useState(() => getInventorySnapshot().equipped);

  useEffect(() => {
    const syncInventory = (event) => {
      const detail = event?.detail;
      if (!detail) return;
      setInventory(detail.slots);
      setEquipped(detail.equipped);
    };
    window.addEventListener('inventory-changed', syncInventory);
    return () => window.removeEventListener('inventory-changed', syncInventory);
  }, []);

  const persistInventory = (nextInventory, nextEquipped) => {
    setInventory(nextInventory);
    setEquipped(nextEquipped);
    setInventorySnapshot({ slots: nextInventory, equipped: nextEquipped });
  };

  // Sync state to Phaser
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('equipment-changed', { detail: equipped }));
  }, [equipped]);

  useEffect(() => {
    const handleRequest = () => {
      window.dispatchEvent(new CustomEvent('equipment-changed', { detail: equipped }));
    };
    window.addEventListener('request-equipment-state', handleRequest);
    return () => window.removeEventListener('request-equipment-state', handleRequest);
  }, [equipped]);

  const handleEquip = (slotIndex) => {
    const item = inventory[slotIndex];
    if (!item) return;

    const targetSlot = inventorySlotOf(item, equipped);
    if (!targetSlot || equipped[targetSlot] === undefined) return;

    const currentEquipped = equipped[targetSlot];
    
    const newInv = [...inventory];
    newInv[slotIndex] = currentEquipped;
    const newEquipped = {
      ...equipped,
      [targetSlot]: item,
    };
    persistInventory(newInv, newEquipped);
  };

  const handleUnequip = (slotId) => {
    const item = equipped[slotId];
    if (!item) return;

    const emptyIndex = inventory.findIndex(i => i === null);
    if (emptyIndex === -1) return;

    const newEquipped = {
      ...equipped,
      [slotId]: null,
    };
    const newInv = [...inventory];
    newInv[emptyIndex] = item;
    persistInventory(newInv, newEquipped);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input or spellweave editor
      if (
        e.target.tagName === 'INPUT'
        || e.target.tagName === 'TEXTAREA'
        || e.target.isContentEditable
      ) return;
      
      if (e.key.toLowerCase() === 'i') {
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const overlayVariants = {
    hidden: { opacity: 0, backdropFilter: "blur(0px)" },
    visible: { opacity: 1, backdropFilter: "blur(8px)" }
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: "spring", damping: 25, stiffness: 300 }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: -20,
      transition: { duration: 0.2 }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className={styles.overlay}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={() => setIsOpen(false)}
        >
          <motion.div 
            className={styles.modal}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2>Inventory</h2>
              <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>×</button>
            </div>

            <div className={styles.content}>
              {/* Character Equipment Pane */}
              <div className={styles.characterPane}>
                <div className={styles.characterDisplay}>
                  <div className={styles.modelWrapper}>
                    {/* SVG Filter for Muscle Morphing */}
                    <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
                      <defs>
                        <filter id="muscleMorph" x="0" y="0" width="100%" height="100%">
                          <feImage href={CHARACTER_IMAGE_URL} result="muscleMap" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
                          <feDisplacementMap 
                            in="SourceGraphic" 
                            in2="muscleMap" 
                            scale="4" 
                            xChannelSelector="R" 
                            yChannelSelector="G" 
                          />
                        </filter>
                      </defs>
                    </svg>

                    <img src={CHARACTER_IMAGE_URL} alt="Character Model" className={styles.characterModelBase} />
                    {equipped.chest && <img src={equipped.chest.sprite} alt="" className={styles.characterModelLayer} />}
                    {equipped.legs && <img src={equipped.legs.sprite} alt="" className={styles.characterModelLayer} />}
                    {equipped.boots && <img src={equipped.boots.sprite} alt="" className={styles.characterModelLayer} />}
                    {equipped.head && <img src={equipped.head.sprite} alt="" className={styles.characterModelLayer} />}
                    {equipped.weapon && <img src={equipped.weapon.sprite} alt="" className={styles.characterModelLayer} />}
                  </div>
                  
                  {/* Render Equipment Slots around the character */}
                  {EQUIPMENT_SLOTS.map(slot => {
                    const item = equipped[slot.id];
                    return (
                      <motion.div 
                        key={slot.id} 
                        className={`${styles.equipSlot} ${styles[`pos-${slot.pos}`]}`} 
                        title={item ? `${item.name} (${item.rarity})` : slot.label}
                        whileHover={{ scale: 1.05, borderColor: '#06B6D4' }}
                        whileTap={{ scale: 0.95 }}
                        onDoubleClick={() => handleUnequip(slot.id)}
                        data-rarity={item?.rarity || 'empty'}
                      >
                        {item ? (
                          <img src={item.icon} alt={item.name} className={styles.itemIcon} />
                        ) : (
                          <span className={styles.slotLabel}>{slot.label}</span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
                <div className={styles.statsPanel}>
                  <div className={styles.statRow}><span>Level</span> <span>1</span></div>
                  <div className={styles.statRow}><span>HP</span> <span>100 / 100</span></div>
                  <div className={styles.statRow}><span>Power</span> <span>15</span></div>
                  <div className={styles.statRow}><span>Defense</span> <span>10</span></div>
                </div>
              </div>

              {/* 24-Slot Inventory Grid */}
              <div className={styles.inventoryPane}>
                <div className={styles.grid}>
                  {inventory.map((item, i) => (
                    <motion.div 
                      key={i} 
                      className={styles.itemSlot}
                      whileHover={{ scale: 1.05, borderColor: '#06B6D4' }}
                      whileTap={{ scale: 0.95 }}
                      title={item ? `${item.name} (${item.rarity})` : ''}
                      onDoubleClick={() => handleEquip(i)}
                      data-rarity={item?.rarity || 'empty'}
                    >
                      {item && (
                        <img src={item.icon} alt={item.name} className={styles.itemIcon} />
                      )}
                    </motion.div>
                  ))}
                </div>
                <div className={styles.currencyPanel}>
                  <span>Gold: <strong style={{color: '#D4AF37'}}>0</strong></span>
                  <span>Arcana: <strong style={{color: '#B8F7FF'}}>0</strong></span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
