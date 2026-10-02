/**
 * DEMO "Questions or concerns" from fictional employees – Director app only.
 * Built with the real rules so each state is realistic.
 */
import {
  closeRequest,
  createRequest,
  directorMessage,
  markInProgress,
  type RightsRequest,
} from '../../../src/participation/index.js';
import { DEMO_DIRECTOR } from './dataset.js';

const at = (iso: string) => new Date(iso);

export function demoRightsRequests(): RightsRequest[] {
  const question = createRequest({
    id: 'seed-q-tom',
    employeeId: 's3',
    employeeName: 'Tom Reilly',
    department: 'Sales',
    type: 'question',
    message: 'Will my line manager be able to see my full report, or just the Directors?',
    now: at('2026-09-29T15:20:00Z'),
  });

  let sar = createRequest({
    id: 'seed-sar-ruby',
    employeeId: 'c1',
    employeeName: 'Ruby Clarke',
    department: 'Customer Service',
    type: 'copy_of_data',
    message: 'Please could I have a copy of all the information FocusiQ holds about me, including any notes?',
    now: at('2026-09-04T10:05:00Z'),
  });
  sar = directorMessage(sar, DEMO_DIRECTOR, 'Thank you – we have received your request and will send your information by the date shown.', false, at('2026-09-05T09:00:00Z'));
  sar = directorMessage(sar, DEMO_DIRECTOR, 'Export drafted. Check whether internal adjustment notes should be disclosed before sending.', true, at('2026-09-26T16:40:00Z'));

  let objection = createRequest({
    id: 'seed-obj-zara',
    employeeId: 'm3',
    employeeName: 'Zara Ali',
    department: 'Marketing',
    type: 'objection',
    message: 'I am happy to do the assessment for my own development, but I do not want my results compared with colleagues.',
    now: at('2026-09-15T11:30:00Z'),
  });
  objection = markInProgress(objection, DEMO_DIRECTOR, at('2026-09-16T09:10:00Z'));
  objection = directorMessage(objection, DEMO_DIRECTOR, 'Considering whether excluding from benchmarks only (keeping personal reports) meets the objection.', true, at('2026-09-16T09:12:00Z'));

  let correction = createRequest({
    id: 'seed-cor-liam',
    employeeId: 's5',
    employeeName: 'Liam Carter',
    department: 'Sales',
    type: 'correction',
    message: 'My start date shows 2020 but I started in January 2019.',
    now: at('2026-09-10T08:15:00Z'),
  });
  correction = closeRequest(correction, DEMO_DIRECTOR, 'corrected', 'Your start date has been corrected to January 2019.', at('2026-09-11T10:00:00Z'));

  return [question, sar, objection, correction];
}
