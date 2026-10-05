/**
 * Single-series donut for a right/wrong score (e.g. 67 of 70 correct): the
 * share correct in --accent on the track. No engine imports, so both the
 * Director and employee apps can use it.
 */
const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);

export function ScoreDonut({ correct, total, label = 'correct' }: { correct: number; total: number; label?: string }) {
  const size = 180;
  const r = 70;
  const stroke = 22;
  const c = 2 * Math.PI * r;
  const len = total ? (correct / total) * c : 0;
  return (
    <svg className="score-donut" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
      aria-label={`${correct} of ${total} ${label} (${pct(correct, total)}%)`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      {len > 0 && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
          strokeDasharray={`${len} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      )}
      <text x={size / 2} y={size / 2 - 2} fontSize="28" fontWeight="800" textAnchor="middle" fill="var(--ink)">{correct}/{total}</text>
      <text x={size / 2} y={size / 2 + 18} fontSize="12" textAnchor="middle" fill="var(--ink-soft)">{label}</text>
      <text x={size / 2} y={size / 2 + 34} fontSize="13" fontWeight="700" textAnchor="middle" fill="var(--accent)">{pct(correct, total)}%</text>
    </svg>
  );
}
