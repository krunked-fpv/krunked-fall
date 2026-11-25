// ============================================================================
// KRUNKEDFALL — Deterministic Seeded PRNG (Mulberry32)
// ============================================================================
// 100% pure, zero DOM globals, strictly seeded PRNG. Operates exclusively on
// `state.rngState` so every simulation replay is bit-for-bit deterministic.

export interface RngCarrier {
  rngState: number;
}

/**
 * Normalizes any numeric seed into a non-zero 32-bit unsigned integer.
 */
export function normalizeSeed(seed: number): number {
  const s = (Math.floor(seed) >>> 0);
  return s === 0 ? 0x9e3779b9 : s;
}

/**
 * Creates a lightweight local RNG carrier for sub-generators.
 */
export function createRngState(seed: number): RngCarrier {
  return { rngState: normalizeSeed(seed) };
}

/**
 * Advances `state.rngState` via Mulberry32 and returns an unsigned 32-bit int.
 */
export function nextUint32(state: RngCarrier): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0);
}

/**
 * Returns a deterministic float uniformly distributed in [0, 1).
 */
export function nextFloat(state: RngCarrier): number {
  return nextUint32(state) / 4294967296;
}

/**
 * Returns a deterministic integer uniformly distributed in [min, max] (inclusive).
 */
export function nextInt(state: RngCarrier, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  const span = (hi - lo + 1) >>> 0;
  return lo + (nextUint32(state) % span);
}

/**
 * Returns a deterministic float uniformly distributed in [min, max).
 */
export function nextRange(state: RngCarrier, min: number, max: number): number {
  if (max <= min) return min;
  return min + nextFloat(state) * (max - min);
}

/**
 * Deterministically picks one element from a non-empty readonly array.
 */
export function pick<T>(state: RngCarrier, items: readonly T[]): T {
  const len = items.length;
  if (len === 0) {
    throw new Error('rng.pick called on empty array');
  }
  if (len === 1) return items[0];
  return items[nextUint32(state) % len];
}

/**
 * Deterministically evaluates a Bernoulli trial with probability in [0, 1].
 */
export function chance(state: RngCarrier, probability: number): boolean {
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  return nextFloat(state) < probability;
}
