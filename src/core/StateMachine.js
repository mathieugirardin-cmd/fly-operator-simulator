export const TRAIN_STATES = Object.freeze([
  'STORED', 'TRANSFER', 'UNLOADING', 'EMPTY', 'LOADING', 'CHECKING', 'READY',
  'DISPATCHED', 'ON_TRACK', 'BRAKING', 'BLOCKED', 'FAULT', 'MAINTENANCE',
]);

const transitions = {
  STORED: ['TRANSFER', 'MAINTENANCE'],
  TRANSFER: ['UNLOADING', 'EMPTY', 'BLOCKED', 'STORED'],
  UNLOADING: ['TRANSFER', 'BLOCKED', 'STORED'],
  EMPTY: ['LOADING', 'CHECKING', 'STORED'],
  LOADING: ['EMPTY'],
  CHECKING: ['EMPTY', 'READY', 'STORED'],
  READY: ['CHECKING', 'EMPTY', 'DISPATCHED', 'STORED'],
  DISPATCHED: ['ON_TRACK', 'BLOCKED'],
  ON_TRACK: ['BRAKING', 'BLOCKED'],
  BRAKING: ['TRANSFER', 'BLOCKED'],
  BLOCKED: ['TRANSFER', 'UNLOADING', 'DISPATCHED', 'ON_TRACK', 'BRAKING', 'STORED'],
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
