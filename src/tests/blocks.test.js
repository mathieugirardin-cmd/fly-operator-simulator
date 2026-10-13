import { beforeEach, describe, expect, it } from 'vitest';
import { BlockSystem, createBlocks } from '../systems/BlockSystem.js';

describe('acquisition exclusive des cantons', () => {
  let blocks;
  let first;
  let second;
  beforeEach(() => {
    blocks = new BlockSystem({ state: { blocks: createBlocks() } });
    first = { id: 'T01', blockId: 'LOAD', progress: 1 };
    second = { id: 'T02', blockId: 'TRANSFER', progress: 1 };
    blocks.get('LOAD').occupiedBy = first.id;
    blocks.get('TRANSFER').occupiedBy = second.id;
  });

  it('refuse une seconde réservation et conserve la première jusqu’au passage', () => {
    expect(blocks.reserve('DEPART', first.id)).toBe(true);
    expect(blocks.reserve('DEPART', second.id)).toBe(false);
    expect(blocks.get('DEPART').reservedBy).toBe(first.id);
    expect(blocks.enter(second, 'DEPART')).toBe(false);
    expect(second.blockId).toBe('TRANSFER');
    expect(blocks.get('TRANSFER').occupiedBy).toBe(second.id);
    expect(blocks.enter(first, 'DEPART')).toBe(true);
    expect(blocks.get('DEPART').occupiedBy).toBe(first.id);
    expect(blocks.get('DEPART').reservedBy).toBeNull();
    expect(blocks.get('LOAD').occupiedBy).toBeNull();
  });

  it('interdit l’entrée dans un canton occupé sans perdre le canton d’origine', () => {
    expect(blocks.enter(second, 'LOAD')).toBe(false);
    expect(blocks.get('LOAD').occupiedBy).toBe(first.id);
    expect(blocks.get('TRANSFER').occupiedBy).toBe(second.id);
    expect(second.blockId).toBe('TRANSFER');
    expect(second.progress).toBe(1);
  });

  it('interdit également une section indisponible et libère seulement le train concerné', () => {
    blocks.get('DEPART').blocked = true;
    expect(blocks.reserve('DEPART', first.id)).toBe(false);
    expect(blocks.enter(first, 'DEPART')).toBe(false);
    blocks.get('DEPART').blocked = false;
    expect(blocks.reserve('DEPART', first.id)).toBe(true);
    blocks.release(first.id);
    expect(blocks.get('LOAD').occupiedBy).toBeNull();
    expect(blocks.get('DEPART').reservedBy).toBeNull();
    expect(blocks.get('TRANSFER').occupiedBy).toBe(second.id);
    expect(blocks.enter(second, 'LOAD')).toBe(true);
  });
});
