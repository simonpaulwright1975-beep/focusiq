/**
 * "Staff view": the employee app exactly as staff see it, as a practice copy
 * (employee.html?preview). Nothing is saved, sent or emailed. Live, it shows
 * the published privacy notice and questions; the preview itself only opens
 * for a signed-in Director, so staff cannot use it to see the questions early.
 */
import { useState } from 'react';
import { Card } from '../components/ui.js';

const SIZES = { computer: { label: 'Computer', width: '100%', height: 900 }, phone: { label: 'Phone', width: '390px', height: 780 } } as const;

export function StaffPreviewView() {
  const [size, setSize] = useState<keyof typeof SIZES>('computer');
  const [run, setRun] = useState(0);
  const src = `./employee.html?preview&run=${run}`;
  return (
    <div className="stack">
      <Card
        title="Staff view"
        sub="What staff see, from the welcome screen to the end of the assessment – try it yourself. This is a practice copy: nothing you enter is saved, sent or emailed."
        actions={
          <div className="row">
            {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => (
              <button key={k} className={size === k ? 'chip sel' : 'chip'} aria-pressed={size === k} onClick={() => setSize(k)}>{SIZES[k].label}</button>
            ))}
            <button className="btn secondary" onClick={() => setRun((r) => r + 1)}>Start again</button>
            <a className="btn link" href={src} target="_blank" rel="noreferrer">Open in a new tab</a>
          </div>
        }
      >
        <ul className="small secondary preview-tips">
          <li>Go through the welcome steps, then <strong>Start my assessment</strong> to see <strong>Are you prepared and ready?</strong> and the test itself.</li>
          <li>Asking for an adjustment in the preview pauses the test at “being reviewed”, as it would for staff. Answer “No” to carry on to the questions.</li>
          <li>The <strong>Live the Walter Geering Way</strong> card at the top is a made-up score: staff see their own score there once you share it from the WG Way check tab.</li>
          <li>Highlighted text in the privacy notice still needs Walter Geering’s wording before go-live.</li>
        </ul>
        <div className={`preview-frame preview-${size}`}>
          <iframe key={`${run}-${size}`} title="Staff view preview" src={src} style={{ width: SIZES[size].width, height: SIZES[size].height }} />
        </div>
      </Card>
    </div>
  );
}
