/** Numeric protocol IDs need fresh entropy across tabs, reloads, and rapid sends. */
export function nextCombatSequenceId(): number {
  const words = crypto.getRandomValues(new Uint32Array(2));
  // Keep the complete result inside JavaScript's exactly representable integers.
  return (words[0]! & 0x1fffff) * 0x100000000 + words[1]! || 1;
}
