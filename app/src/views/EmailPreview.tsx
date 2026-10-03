/** Shows an email exactly as it will be sent (plain text), with the sign-in link marked. */
import { LINK_TOKEN } from '../../../src/participation/index.js';

export function EmailPreview({ subject, text, to }: { subject: string; text: string; to?: string }) {
  const parts = text.split(LINK_TOKEN);
  return (
    <div className="email-preview">
      <div className="email-head">
        <div><span className="muted">From</span> Walter Geering (FocusiQ)</div>
        {to && <div><span className="muted">To</span> {to}</div>}
        <div><span className="muted">Subject</span> <strong>{subject}</strong></div>
      </div>
      <pre className="email-body">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && <span className="email-link">[link to FocusiQ]</span>}
          </span>
        ))}
      </pre>
    </div>
  );
}
