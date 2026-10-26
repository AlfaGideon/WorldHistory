import { reliabilityLevels } from '../data/sources';

const norm = (value) => String(value || '').toLowerCase();

function toneOf(value) {
  const text = norm(value);
  if (text.includes('высок')) return 'high';
  if (text.includes('средне-выс')) return 'medium-high';
  if (text.includes('средн')) return 'medium';
  if (text.includes('позици')) return 'position';
  if (text.includes('миф') || text.includes('упрощ') || text.includes('опроверг')) return 'myth';
  if (text.includes('спорн')) return 'disputed';
  return 'unknown';
}

export function ReliabilityChip({ value, title }) {
  const tone = toneOf(value);
  const meta = reliabilityLevels.find((level) => level.id === tone);
  return (
    <span className={`reliability ${tone}`} title={title || meta?.hint || value}>
      {value || 'требует оценки'}
    </span>
  );
}

export { toneOf };
export default ReliabilityChip;
