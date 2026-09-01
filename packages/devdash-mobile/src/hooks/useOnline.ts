import { useNetworkState } from 'expo-network';

export function useOnline(): boolean {
  const s = useNetworkState();
  // Unknown (first paint, or a platform that cannot tell) is treated as
  // online so we don't flash a false banner over a working list.
  if (s?.isConnected === false) return false;
  return true;
}
