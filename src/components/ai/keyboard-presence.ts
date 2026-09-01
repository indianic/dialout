// No browser exposes whether a physical keyboard is attached — it is a
// fingerprinting vector, so the capability simply is not queryable. What can be
// done is inference, and this is the unambiguous half of it: an on-screen
// keyboard cannot produce any of the keys below, so seeing one is positive
// proof that a real keyboard is present.
//
// False positives are the dangerous direction. Claiming hardware wrongly makes
// Enter send a half-typed message to a live agent, so anything an on-screen
// keyboard might plausibly emit is left out — Tab in particular, which the
// iPadOS full-size on-screen layout does have.
export function isHardwareKeydown(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  if (e.key === 'Escape') return true;
  if (e.key.startsWith('Arrow')) return true;
  return /^F\d{1,2}$/.test(e.key);
}
