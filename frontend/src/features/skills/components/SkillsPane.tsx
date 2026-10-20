import { useEffect } from 'react';
import { useSkillsStore } from '../../../stores/useSkillsStore';
import { useSkills } from '../hooks/useSkills';
import { SkillDetail } from './SkillDetail';
import './SkillsPane.css';

/** Center column of the Skills tab. Owns the "first skill is pre-selected" rule. */
export function SkillsPane() {
  const { data } = useSkills();
  const selectedId = useSkillsStore((state) => state.selectedId);
  const select = useSkillsStore((state) => state.select);

  useEffect(() => {
    const skills = data?.skills ?? [];
    if (!selectedId && skills.length > 0) {
      select(skills[0].id);
    }
  }, [data, selectedId, select]);

  return (
    <div className="skills-pane">
      <SkillDetail key={selectedId ?? 'none'} />
    </div>
  );
}
