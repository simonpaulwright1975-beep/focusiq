/**
 * Assessment-day data shared by the Assessment day and Notifications tabs:
 * day settings, readiness for everyone, live progress (demo sources).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_DAY_SETTINGS,
  NOTICE_V1,
  assessReadiness,
  type AcknowledgementSummary,
  type AssessmentProgress,
  type DayEmployee,
  type DaySettings,
  type Notification,
} from '../../../src/participation/index.js';
import { listOutbox, subscribeOutbox } from '../demo/outboxStore.js';
import { DEMO_ASSESSMENT } from '../demo/assessment.js';
import { demoAcknowledgements } from '../demo/daySeed.js';
import { demoAcknowledgement, demoProgress, readJson, subscribeParticipation, writeJson } from '../shared/participationStore.js';
import { useStore } from '../state.js';
import { useAdjustmentRequests } from './AdjustmentsView.js';
import { useRightsRequests } from './QuestionsView.js';

const SETTINGS_KEY = 'focusiq-demo-day';
export const PINS_KEY = 'focusiq-demo-day-pins';
export const LIVE_EMPLOYEE = 's4';
const TOTAL_QUESTIONS = DEMO_ASSESSMENT.sections.reduce((n, s) => n + s.questions.length, 0);

export const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Next working day (Mon–Fri) after today, as YYYY-MM-DD. */
export function nextWorkingDay(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return localDate(d);
}

export function useLiveRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => subscribeParticipation(() => setRev((r) => r + 1)), []);
  return rev;
}

export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const loadSettings = (): DaySettings => ({
  ...DEFAULT_DAY_SETTINGS,
  date: nextWorkingDay(),
  assessmentMinutes: DEMO_ASSESSMENT.estimatedMinutes,
  ...readJson<Partial<DaySettings>>(SETTINGS_KEY),
});

/** Day settings (DEMO: kept in this browser; production: assessment_days). */
export function useDaySettings(): [DaySettings, (patch: Partial<DaySettings>) => void] {
  const [settings, setState] = useState<DaySettings>(loadSettings);
  const set = (patch: Partial<DaySettings>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      writeJson(SETTINGS_KEY, next);
      return next;
    });
  return [settings, set];
}

/** Read-only settings for other tabs. */
export const currentDaySettings = loadSettings;

export function useReadiness(settings: DaySettings, now: Date) {
  const { demo } = useStore();
  const adjustments = useAdjustmentRequests();
  const rightsRequests = useRightsRequests();
  const live = useLiveRevision();
  const employees: DayEmployee[] = useMemo(
    () => demo.employees.map((e) => ({ employeeId: e.id, name: e.displayName, department: e.department, jobRole: e.role ?? '', status: e.status })),
    [demo],
  );
  const acknowledgements: AcknowledgementSummary[] = useMemo(() => {
    const seeded = demoAcknowledgements(employees.map((e) => e.employeeId), NOTICE_V1.version);
    const mine = demoAcknowledgement();
    return mine
      ? [...seeded, { employeeId: LIVE_EMPLOYEE, noticeVersion: mine.noticeVersion, detailsCorrect: mine.detailsCorrect, acknowledgedAt: mine.acknowledgedAt }]
      : seeded;
  }, [employees, live]);
  const progress = useMemo(() => {
    const p = demoProgress(LIVE_EMPLOYEE, TOTAL_QUESTIONS);
    return p ? { [LIVE_EMPLOYEE]: p } : ({} as Record<string, AssessmentProgress>);
  }, [live, now]);
  const readiness = useMemo(
    () => assessReadiness({ employees, currentNoticeVersion: NOTICE_V1.version, acknowledgements, adjustments, rightsRequests }, settings),
    [employees, acknowledgements, adjustments, rightsRequests, settings],
  );
  return { ...readiness, progress, adjustments, rightsRequests };
}

export function useOutbox(): Notification[] {
  const [box, setBox] = useState(listOutbox);
  useEffect(() => subscribeOutbox(() => setBox(listOutbox())), []);
  return box;
}
