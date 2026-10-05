/**
 * DEMO assessment content – display only (no answer keys).
 * The scoring metadata lives in ./scoring.ts, which the employee app never imports.
 */
import type { AssessmentDefinition, MediaRef } from '../../../src/runner/index.js';

const media = (file: string, sha256: string, alt: string): MediaRef => ({
  src: `./assessment-media/demo/${file}`,
  sha256,
  alt,
});

export const DEMO_ASSESSMENT: AssessmentDefinition = {
  version: 'focusiq-demo-2026.1',
  title: 'FocusiQ assessment (demo)',
  estimatedMinutes: 15,
  sections: [
    {
      id: 'reading',
      title: 'Reading and deciding',
      instructions: [
        'There is no time limit in this section – work in the way you normally would.',
        'You can move back and forth between questions in this section before you submit it.',
      ],
      rememberThis: [
        'Account WG-2041 is The Harbour Hotel. They receive a 12% trade discount.',
        'Deliveries to The Harbour Hotel go out on Tuesdays and Fridays.',
        'Any quote over £5,000 needs Director sign-off.',
      ],
      shuffleQuestions: true,
      scored: true,
      questions: [
        {
          questionVersionId: 'demo-q01',
          kind: 'single_choice',
          stem: 'A hotel’s purchasing manager emails asking for a copy of last month’s invoice. What do you do?',
          options: [
            { id: 'a', text: 'Send the copy from the system now' },
            { id: 'b', text: 'Ask your manager before sending it' },
            { id: 'c', text: 'Check with accounts whether it has been paid first' },
            { id: 'd', text: 'Ask the purchasing manager why they need it' },
          ],
        },
        {
          questionVersionId: 'demo-q02',
          kind: 'single_choice',
          stem: 'Is this quote ready to send?',
          detail: [
            'Quote for The Harbour Hotel (WG-2041)',
            '50 × 300ml shampoo refill @ £4.20 = £210.00',
            'Trade discount applied: 10%',
            'Total after discount: £189.00',
          ],
          options: [
            { id: 'a', text: 'Yes, it is ready to send' },
            { id: 'b', text: 'No – the discount should be 12%' },
            { id: 'c', text: 'No – the line total is wrong' },
            { id: 'd', text: 'No – it needs Director sign-off' },
          ],
        },
        {
          questionVersionId: 'demo-q03',
          kind: 'single_choice',
          stem: 'The head housekeeper at The Harbour Hotel asks for a Wednesday delivery of welcome packs. Which days can you offer?',
          options: [
            { id: 'a', text: 'Tuesday or Friday' },
            { id: 'b', text: 'Monday or Thursday' },
            { id: 'c', text: 'Any weekday' },
            { id: 'd', text: 'Wednesday, as requested' },
          ],
        },
        {
          questionVersionId: 'demo-q04',
          kind: 'single_choice',
          stem: 'The system shows 40 boxes of barista sugar sticks, but the shelf count is 38. They sell about 200 boxes a month. What is the best next step?',
          options: [
            { id: 'a', text: 'Adjust the stock record and add a short note' },
            { id: 'b', text: 'Recount the whole aisle before doing anything' },
            { id: 'c', text: 'Raise it with a Director' },
            { id: 'd', text: 'Leave it – it will even out' },
          ],
        },
      ],
    },
    {
      id: 'quick',
      title: 'Quick decisions',
      instructions: [
        'This section is timed. A clock shows the time left for the whole section.',
        'If time runs out, the answers you have given so far are saved.',
        'Aim for a good answer rather than a perfect one.',
      ],
      timeLimitSeconds: 120,
      shuffleQuestions: true,
      scored: true,
      questions: [
        {
          questionVersionId: 'demo-q05',
          kind: 'single_choice',
          stem: 'Which tile comes next in the sequence?',
          image: media('sequence.svg', '076acec53c46cd20206f7d406421601887f6d7a57e404b19b2c4a8018864fcc0', 'A triangle pointing up, then right, then down, followed by a question mark.'),
          options: [
            { id: 'a', image: media('tri-up.svg', 'b489552cbd744e783935e9d2c0951345693f4d1423e805dece7c7654c2c08485', 'Triangle pointing up') },
            { id: 'b', image: media('tri-right.svg', '58efbdca44a76c0edece40519ddf2bcafccad0c93f5cf2ca2aae8445a8c5101b', 'Triangle pointing right') },
            { id: 'c', image: media('tri-down.svg', 'fcefcad42e0ef4f589616051ba81f79f198f90153a424a09a234acbef78dd749', 'Triangle pointing down') },
            { id: 'd', image: media('tri-left.svg', 'b20c3ed376184ee44924cd0aca0ee0485be18430626fce02d23670799a5960c3', 'Triangle pointing left') },
          ],
        },
        {
          questionVersionId: 'demo-q06',
          kind: 'single_choice',
          stem: 'Guest soaps come in cases of 25. A holiday park needs 160 soaps for its lodges. How many cases does it need?',
          options: [
            { id: 'a', text: '6' },
            { id: 'b', text: '7' },
            { id: 'c', text: '8' },
            { id: 'd', text: '6.4' },
          ],
        },
        {
          questionVersionId: 'demo-q07',
          kind: 'single_choice',
          stem: 'Rule: ship the order with the earliest promised date first. Which order ships first?',
          detail: ['Order 118 – Bayview Hotel, promised Thursday', 'Order 121 – Oakfield Lodges, promised Tuesday', 'Order 124 – The Grange Hotel, promised Wednesday', 'Order 125 – Seaview Holiday Park, promised Friday'],
          shuffleOptions: false,
          options: [
            { id: 'a', text: 'Order 118' },
            { id: 'b', text: 'Order 121' },
            { id: 'c', text: 'Order 124' },
            { id: 'd', text: 'Order 125' },
          ],
        },
        {
          questionVersionId: 'demo-q08',
          kind: 'single_choice',
          stem: 'A pack of bath mats sells for £20 and costs £15. A dispenser refill sells for £12 and costs £6. Which earns more profit for each one sold?',
          options: [
            { id: 'a', text: 'The pack of bath mats' },
            { id: 'b', text: 'The dispenser refill' },
            { id: 'c', text: 'They earn the same' },
          ],
        },
      ],
    },
    {
      id: 'priorities',
      title: 'Priorities and judgement',
      instructions: [
        'There is no time limit in this section.',
        'For ranking questions, put the items in order using the arrows (most important at the top).',
      ],
      shuffleQuestions: true,
      scored: true,
      questions: [
        {
          questionVersionId: 'demo-q09',
          kind: 'ranking',
          stem: 'It is Monday morning. Put these tasks in the order you would do them.',
          options: [
            { id: 'call', text: 'Call back an accommodation manager whose welcome packs arrived damaged' },
            { id: 'quote', text: 'Send a £4,200 quote a hotel group’s purchasing manager asked for yesterday' },
            { id: 'crm', text: 'Update CRM notes from last week’s site visits' },
            { id: 'drive', text: 'Tidy the shared drive' },
          ],
        },
        {
          questionVersionId: 'demo-q10',
          kind: 'single_choice',
          stem: 'It is 4pm. You have made all 20 planned follow-up calls to hotels, but you have 2 of this week’s target of 3 new orders. What do you do?',
          options: [
            { id: 'a', text: 'Log the calls and finish – the plan for today is done' },
            { id: 'b', text: 'Call two hotels that asked for samples earlier in the week' },
            { id: 'c', text: 'Email your manager an update' },
            { id: 'd', text: 'Plan tomorrow’s calls' },
          ],
        },
        {
          questionVersionId: 'demo-q11',
          kind: 'single_choice',
          stem: 'The operations manager of a hotel group you supply mentions they are opening a new 80-room hotel next month. What would you do?',
          options: [
            { id: 'a', text: 'Note it on their account and offer to plan amenities and linen for the opening' },
            { id: 'b', text: 'Congratulate them' },
            { id: 'c', text: 'Tell your manager and let them decide' },
            { id: 'd', text: 'Wait until they place an order' },
          ],
        },
        {
          questionVersionId: 'demo-q12',
          kind: 'single_choice',
          stem: 'A delivery of guest toiletries is going to arrive a day late, just before the hotel’s busy weekend. The head housekeeper has not noticed yet. What do you do?',
          options: [
            { id: 'a', text: 'Phone the head housekeeper now with the new date and their options' },
            { id: 'b', text: 'Wait and see whether they notice' },
            { id: 'c', text: 'Email the warehouse to ask why' },
            { id: 'd', text: 'Ask your manager what to do' },
          ],
        },
      ],
    },
    {
      id: 'motivation',
      title: 'What motivates you',
      instructions: [
        'There are no right or wrong answers here, and this section is not scored.',
        'It helps Walter Geering understand how to support and recognise you.',
      ],
      scored: false,
      purpose: 'motivation',
      questions: [
        {
          questionVersionId: 'demo-q13',
          kind: 'ranking',
          stem: 'Put these in order, from what matters most to you at work to what matters least.',
          options: [
            { id: 'progression', text: 'Opportunities to progress' },
            { id: 'recognition', text: 'Being recognised for good work' },
            { id: 'autonomy', text: 'Freedom to decide how I work' },
            { id: 'financial_reward', text: 'Financial reward' },
            { id: 'security', text: 'Stability and security' },
            { id: 'mastery', text: 'Becoming expert at what I do' },
            { id: 'team', text: 'Being part of a strong team' },
            { id: 'customer_impact', text: 'Making a difference for customers and their guests' },
          ],
        },
      ],
    },
  ],
};
