import { Redirect, useLocalSearchParams } from 'expo-router';

// Push payloads and the web app use `/ai/{machineId}/{tmuxName}`.
export default function AiAlias() {
  const { machineId, tmuxName } = useLocalSearchParams<{ machineId: string; tmuxName: string }>();
  return <Redirect href={`/session/${machineId}/${tmuxName}`} />;
}
