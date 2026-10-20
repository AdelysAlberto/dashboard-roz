import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

/** Full skills snapshot: one filesystem scan of ROZ_SKILLS_DIRS plus the overlay. */
export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: async () => api.getSkills(),
    staleTime: 60_000,
  });
}

/** SKILL.md body and file inventory for the selected skill. */
export function useSkillDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.skillDetail(id),
    queryFn: async () => api.getSkillDetail(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
