import { describe as suite, expect, it } from 'vitest';
import {
  DecisionInvalidError,
  agreedTimeMultiplier,
  decideAdjustment,
  employeeAdjustmentView,
  validateDecision,
  type AdjustmentRequest,
  type DecisionInput,
} from '../src/participation/index.js';
import type { Actor } from '../src/benchmarking/index.js';

const director: Actor = { id: 'd1', name: 'Demo Director', role: 'director' };
const manager: Actor = { id: 'm1', name: 'Line Manager', role: 'manager' };
const NOW = new Date('2026-10-05T10:00:00Z');
const request: AdjustmentRequest = {
  id: 'r1',
  employeeId: 'e1',
  employeeName: 'Grace Okafor',
  department: 'Sales',
  description: 'Reading quickly under time pressure is hard for me – could I have extra time?',
  createdAt: '2026-10-02T09:00:00Z',
  status: 'pending',
  history: [],
};
const agree: DecisionInput = {
  status: 'agreed',
  arrangements: ['extra_time', 'rest_breaks'],
  timeMultiplier: 1.25,
  employeeMessage: 'We have agreed 25% extra time and a short break between sections.',
  internalNote: 'Discussed with HR on 4 Oct.',
};

suite('deciding adjustment requests', () => {
  it('only Directors (or authorised managers) can decide', () => {
    expect(validateDecision(request, agree, manager).permission).toBeTruthy();
    expect(validateDecision(request, agree, { ...manager, benchmarkAuthority: true }).permission).toBeUndefined();
  });

  it('requires an arrangement, a valid amount of extra time and a message', () => {
    expect(validateDecision(request, { ...agree, arrangements: [], timeMultiplier: null }, director).arrangements).toBeTruthy();
    expect(validateDecision(request, { ...agree, timeMultiplier: 1 }, director).timeMultiplier).toBeTruthy();
    expect(validateDecision(request, { ...agree, timeMultiplier: 3.5 }, director).timeMultiplier).toBeTruthy();
    expect(validateDecision(request, { ...agree, arrangements: ['rest_breaks'] }, director).timeMultiplier).toMatch(/only be set with/);
    expect(validateDecision(request, { ...agree, employeeMessage: ' ' }, director).employeeMessage).toBeTruthy();
    const decline: DecisionInput = { status: 'declined', arrangements: [], timeMultiplier: null, employeeMessage: '' };
    expect(validateDecision(request, decline, director).employeeMessage).toMatch(/Explain the decision/);
  });

  it('records the decision and gives the employee only what they should see', () => {
    const decided = decideAdjustment(request, agree, director, NOW);
    expect(decided.status).toBe('agreed');
    expect(decided.history).toHaveLength(1);
    expect(decided.history[0]).toMatchObject({ decidedBy: 'd1', decidedAt: NOW.toISOString(), internalNote: 'Discussed with HR on 4 Oct.', revisionReason: null });
    const view = employeeAdjustmentView(decided);
    expect(view).toEqual({
      status: 'agreed',
      headline: 'Your adjustment has been agreed',
      message: 'We have agreed 25% extra time and a short break between sections.',
      arrangements: ['25% extra time on timed sections', 'Rest breaks between sections'],
      extraTimePercent: 25,
      canStart: true,
    });
    expect(JSON.stringify(view)).not.toMatch(/HR on 4 Oct|Demo Director/);
    expect(agreedTimeMultiplier(decided)).toBe(1.25);
  });

  it('blocks starting while pending, and a decline lets the employee start without the adjustment', () => {
    expect(employeeAdjustmentView(request).canStart).toBe(false);
    const declined = decideAdjustment(
      request,
      { status: 'declined', arrangements: [], timeMultiplier: null, employeeMessage: 'We can offer a quiet room instead – please speak to HR.' },
      director,
      NOW,
    );
    expect(employeeAdjustmentView(declined)).toMatchObject({ status: 'declined', canStart: true, arrangements: [] });
    expect(agreedTimeMultiplier(declined)).toBe(1);
  });

  it('revising a decision needs a reason and keeps the full history', () => {
    const first = decideAdjustment(request, agree, director, NOW);
    expect(() => decideAdjustment(first, { ...agree, timeMultiplier: 1.5 }, director, NOW)).toThrow(DecisionInvalidError);
    const revised = decideAdjustment(first, { ...agree, timeMultiplier: 1.5, revisionReason: 'Occupational health advice received' }, director, new Date('2026-10-06T10:00:00Z'));
    expect(revised.history.map((h) => h.timeMultiplier)).toEqual([1.25, 1.5]);
    expect(revised.history[1]!.revisionReason).toBe('Occupational health advice received');
    expect(agreedTimeMultiplier(revised)).toBe(1.5);
  });
});
