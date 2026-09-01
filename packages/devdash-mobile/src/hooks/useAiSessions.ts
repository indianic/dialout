import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AI_SESSIONS_KEY, expandAiSessions, fetchAiSessions } from '../api/ai-sessions';
import { useAuth } from '../store/auth';

export function useAiSessions() {
  const machines = useAuth((s) => s.machines);
  const qc = useQueryClient();
  return useQuery({
    queryKey: AI_SESSIONS_KEY,
    queryFn: async () => {
      const r = await fetchAiSessions(machines);
      if (r.covered !== 'all') {
        void expandAiSessions(machines, r.rows, r.covered).then((rows) => {
          qc.setQueryData(AI_SESSIONS_KEY, rows);
        });
      }
      return r.rows;
    },
    enabled: machines.length > 0,
    refetchInterval: 15_000,
  });
}
