import type {
  CareerGraphAnalysis,
  SkillClassification,
} from '../../lib/career/graph/contracts';

/**
 * Classified skills + evidence trails (Task 17).
 *
 * Skills are grouped into demonstrated / adjacent / missing / ambiguous /
 * not-required (ignored). Every skill shows a full evidence trail: canonical
 * concept id, occupation relation path, posting (job) evidence span count,
 * résumé evidence span count, source releases, and decomposed scores.
 *
 * Evidence law (Task 16): a `missing` skill is reported as "not found in this
 * résumé" — we NEVER claim the candidate "does not have" the skill, because the
 * graph only sees the posting + this résumé text.
 */
interface SkillEvidencePanelProps {
  analysis: CareerGraphAnalysis;
}

function classificationNote(skill: SkillClassification): string {
  switch (skill.classification) {
    case 'missing':
      return `${skill.label} was not found in this résumé. The posting lists it as ${skill.requirement}.`;
    case 'demonstrated':
      return `${skill.label} is demonstrated in this résumé.`;
    case 'adjacent':
      return `${skill.label} is adjacent — related experience is present in this résumé.`;
    case 'ambiguous':
      return `${skill.label} could not be classified with the available evidence.`;
    case 'not_required':
      return `${skill.label} is not required for this target role.`;
    default:
      return '';
  }
}

function SkillEvidenceTrail({ skill }: { skill: SkillClassification }) {
  const { scores } = skill;
  return (
    <ul className="skill-evidence-trail">
      <li>
        Canonical skill: <code>{skill.conceptId}</code>
      </li>
      <li>Occupation relation: {skill.relationPath.join(' → ') || '—'}</li>
      <li>
        Posting evidence: {skill.jobEvidence.length} span
        {skill.jobEvidence.length === 1 ? '' : 's'}
      </li>
      <li>
        Résumé evidence: {skill.resumeEvidence.length} span
        {skill.resumeEvidence.length === 1 ? '' : 's'}
      </li>
      <li>Sources: {skill.sources.join(', ') || '—'}</li>
      <li>
        Scores: job {scores.job} · occupation {scores.occupation} · résumé {scores.resume}
        {scores.semantic != null ? ` · semantic ${scores.semantic}` : ''}
      </li>
    </ul>
  );
}

const GROUPS: { key: string; title: string; match: (s: SkillClassification) => boolean }[] = [
  { key: 'demonstrated', title: 'Demonstrated', match: (s) => s.classification === 'demonstrated' },
  { key: 'adjacent', title: 'Adjacent (safe wording available)', match: (s) => s.classification === 'adjacent' },
  { key: 'missing', title: 'Missing — not found in résumé', match: (s) => s.classification === 'missing' },
  { key: 'ambiguous', title: 'Ambiguous', match: (s) => s.classification === 'ambiguous' },
  { key: 'ignored', title: 'Ignored (not required)', match: (s) => s.classification === 'not_required' },
];

export default function SkillEvidencePanel({ analysis }: SkillEvidencePanelProps) {
  const skills = analysis.skills;
  const essential = skills.filter(
    (s) => s.requirement === 'required' || s.requirement === 'preferred'
  );

  return (
    <section className="skill-evidence-panel" aria-label="Skill evidence">
      <h3 className="skill-evidence-heading">Essential skill coverage</h3>
      <p className="skill-evidence-summary">
        {essential.length} essential skill{essential.length === 1 ? '' : 's'} tracked for
        this target role · {skills.length} classified in total.
      </p>

      {GROUPS.map((group) => {
        const items = skills.filter(group.match);
        if (items.length === 0) return null;
        return (
          <div className="skill-group" key={group.key}>
            <h4 className="skill-group-title">
              {group.title} ({items.length})
            </h4>
            <ul className="skill-list">
              {items.map((skill) => (
                <li
                  key={skill.conceptId}
                  className={`skill-item skill-item--${skill.classification}`}
                >
                  <div className="skill-item-head">
                    <span className="skill-label">{skill.label}</span>
                    <span className="skill-badge">{skill.classification}</span>
                    <span className="skill-requirement">{skill.requirement}</span>
                  </div>
                  <p className="skill-note">{classificationNote(skill)}</p>
                  <SkillEvidenceTrail skill={skill} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {skills.length === 0 && (
        <p className="skill-evidence-empty">
          No skills were classified for this target role.
        </p>
      )}
    </section>
  );
}
