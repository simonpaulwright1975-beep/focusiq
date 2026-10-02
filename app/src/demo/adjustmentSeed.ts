/**
 * DEMO adjustment requests from fictional employees, seeded into the Director
 * dashboard only. Never imported by the employee app.
 */
import type { AdjustmentRequest } from '../../../src/participation/index.js';

export const DEMO_ADJUSTMENT_REQUESTS: AdjustmentRequest[] = [
  {
    id: 'seed-ella',
    employeeId: 'c7',
    employeeName: 'Ella Foster',
    department: 'Customer Service',
    description: 'Background noise makes it hard for me to concentrate, and reading against a clock makes me anxious. Could I do it somewhere quiet, with a bit more time?',
    createdAt: '2026-10-01T08:42:00Z',
    status: 'pending',
    history: [],
  },
  {
    id: 'seed-owen',
    employeeId: 'm2',
    employeeName: 'Owen Hughes',
    department: 'Marketing',
    description: 'I use larger text on screen and read more slowly. Extra time on any timed parts would help.',
    createdAt: '2026-09-24T14:10:00Z',
    status: 'agreed',
    history: [
      {
        status: 'agreed',
        arrangements: ['extra_time', 'larger_text'],
        timeMultiplier: 1.5,
        employeeMessage: 'We have agreed 50% extra time on timed sections. You can zoom the page as much as you need.',
        internalNote: 'Same arrangement as agreed for other on-screen tests.',
        decidedBy: 'director-demo',
        decidedByName: 'Demo Director',
        decidedAt: '2026-09-25T09:15:00Z',
        revisionReason: null,
      },
    ],
  },
  {
    id: 'seed-kai',
    employeeId: 'c8',
    employeeName: 'Kai Robinson',
    department: 'Customer Service',
    description: 'Could I skip the timed section? I do not like being rushed.',
    createdAt: '2026-09-22T11:30:00Z',
    status: 'declined',
    history: [
      {
        status: 'declined',
        arrangements: [],
        timeMultiplier: null,
        employeeMessage:
          'The timed section is the same for everyone so results can be compared fairly, so we can’t remove it. If something makes timed tasks harder for you, please talk to HR and we will look at what would help.',
        internalNote: null,
        decidedBy: 'director-demo',
        decidedByName: 'Demo Director',
        decidedAt: '2026-09-23T10:00:00Z',
        revisionReason: null,
      },
    ],
  },
];

