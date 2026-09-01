import { useWindowDimensions } from 'react-native';

// Shortest-side ≥ 600 fires on some phones (pixel width, or column+wrap
// layouts). Two-up cards are iPad-only: width at least a 768pt portrait iPad.
export function useTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= 768;
}
