export const TRAIN_STATES = Object.freeze([
  'STORED', 'TRANSFER', 'UNLOADING', 'EMPTY', 'LOADING', 'CHECKING', 'READY',
  'DISPATCHED', 'ON_TRACK', 'BRAKING', 'BLOCKED', 'FAULT', 'MAINTENANCE', 'GARAGING','INSERTING',
]);

const transitions = {
  STORED: ['TRANSFER', 'MAINTENANCE','INSERTING'],
  INSERTING:['TRANSFER'],
  TRANSFER: ['UNLOADING', 'EMPTY', 'BLOCKED', 'STORED'],
  UNLOADING: ['TRANSFER', 'BLOCKED', 'STORED', 'GARAGING'],
  EMPTY: ['LOADING', 'CHECKING', 'STORED', 'GARAGING'],
  LOADING: ['EMPTY'],
  CHECKING: ['EMPTY', 'READY', 'STORED', 'GARAGING'],
  READY: ['CHECKING', 'EMPTY', 'DISPATCHED', 'STORED', 'GARAGING'],
  DISPATCHED: ['ON_TRACK', 'BLOCKED'],
  ON_TRACK: ['BRAKING', 'BLOCKED'],
  BRAKING: ['TRANSFER', 'BLOCKED'],
  BLOCKED: ['TRANSFER', 'UNLOADING', 'DISPATCHED', 'ON_TRACK', 'BRAKING', 'STORED', 'GARAGING'],
  GARAGING: ['STORED'],
  FAULT: ['MAINTENANCE', 'STORED'],
  MAINTENANCE: ['STORED'],
};

export function transition(train, next) {
  if (next === train.state) return;
  if (!TRAIN_STATES.includes(next) || !transitions[train.state]?.includes(next)) {
    throw new Error(`Transition interdite pour ${train.id} : ${train.state} → ${next}.`);
  }
  train.state = next;
}
