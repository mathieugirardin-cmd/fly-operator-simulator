import { TRACK } from '../config/track.js';

export function createBlocks() {
  return TRACK.map(({ id, name, type, length, maxSpeed }) => ({
    id, name, type, length, maxSpeed, occupiedBy: null, reservedBy: null, blocked: false,
  }));
}

export class BlockSystem {
  constructor(engine) { this.engine = engine; }
  get(id) { return this.engine.state.blocks.find((block) => block.id === id); }
  canEnter(id, trainId) {
    const block = this.get(id);
    if(this.engine.maintenance?.has(`block:${id}`)||this.engine.maintenance?.has('supervision'))return false;
    return Boolean(block && !block.blocked && (!block.occupiedBy || block.occupiedBy === trainId)
      && (!block.reservedBy || block.reservedBy === trainId));
  }
  reserve(id, trainId) {
    if (!this.canEnter(id, trainId)) return false;
    this.get(id).reservedBy = trainId;
    return true;
  }
  enter(train, id) {
    // Réservation et mutation sont synchrones : aucun observateur n'intervient entre les deux.
    if (!this.reserve(id, train.id)) return false;
    this.release(train.id);
    const destination = this.get(id);
    destination.occupiedBy = train.id;
    destination.reservedBy = null;
    train.blockId = id;
    train.progress = 0;
    return true;
  }
  release(trainId) {
    for (const block of this.engine.state.blocks) {
      if (block.occupiedBy === trainId) block.occupiedBy = null;
      if (block.reservedBy === trainId) block.reservedBy = null;
    }
  }
}
