// A terminal follows the tail unless you have scrolled away from it. Pulled
// out of the component so the threshold is a tested constant rather than a
// number buried in an effect.
export const PIN_THRESHOLD_PX = 80;

export function shouldFollow(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number = PIN_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
