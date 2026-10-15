-- A fuller, more professional FocusiQ invitation: why we are asking, what is
-- involved, how to prepare, how to start and what happens next. Still a nudge
-- to sign in (CLAUDE.md): no results, names or request content. The edge
-- function also sends an HTML version built from the same text.
-- Mirror of src/participation/notifications.ts (tests/notifications.test.ts).
create or replace function focusiq.focusiq_employee_email(p_kind text, p_name text, out subject text, out body text)
language plpgsql immutable set search_path = focusiq as $$
declare lines text[];
begin
  case p_kind
    when 'adjustment_decided' then
      subject := 'Your FocusiQ adjustment request has been reviewed';
      lines := array['Walter Geering has reviewed your adjustment request for the FocusiQ assessment. Sign in to FocusiQ to see the outcome:', '{{link}}'];
    when 'request_reply' then
      subject := 'New reply to your FocusiQ question or request';
      lines := array['Walter Geering has replied to your question or request. Sign in to FocusiQ to read the reply:', '{{link}}'];
    when 'request_extended' then
      subject := 'Update on your FocusiQ request';
      lines := array['Walter Geering needs more time to respond fully to your request. Sign in to FocusiQ to see the new response date and the reason:', '{{link}}'];
    when 'request_closed' then
      subject := 'Your FocusiQ question or request has been closed';
      lines := array['Walter Geering has closed your question or request. Sign in to FocusiQ to read the final message:', '{{link}}'];
    when 'summary_released' then
      subject := 'Your FocusiQ summary is ready';
      lines := array['Your FocusiQ summary is ready to read. Sign in to FocusiQ to see it:', '{{link}}'];
    when 'acknowledgement_reminder' then
      subject := 'Please complete your FocusiQ acknowledgement';
      lines := array['Before your FocusiQ assessment, please read the privacy notice and complete the short acknowledgement form. It takes about 5 minutes:', '{{link}}'];
    when 'focusiq_invitation' then
      subject := 'Your invitation to take part in FocusiQ';
      lines := array[
        'Walter Geering would like you to take part in FocusiQ, our working-style assessment. This email explains why we are asking, what is involved and how to start.',
        '',
        'Why we are asking',
        'FocusiQ shows how each of us takes in information, prioritises, decides and follows things through. It helps us give everyone the right support, tools and training, and it forms part of your development review. It is not a pass/fail test, and there is no single right way to work.',
        '',
        'What it involves',
        '- About 5 minutes to read the privacy notice and confirm your details.',
        '- The assessment itself: about 40 minutes, in eight short sections based on our customers and products. Five sections are timed, and a calculator is allowed.',
        '- You may then be asked to take the 10-minute Live the Walter Geering Way check, using the button at the end.',
        '',
        'Before you start',
        '- Find a quiet place where you will not be interrupted for about an hour.',
        '- Use a computer or laptop if you can, and stay in the same browser throughout.',
        '- Work on your own and go with your first answer. Please do not discuss the questions with colleagues.',
        '',
        'How to start',
        'Open FocusiQ with the link below and choose Get started. Sign in with your usual Walter Geering email and password (the same as for the Hub), or with the one-time sign-in code you have been given.',
        '{{link}}',
        '',
        'What happens next',
        'A Director reviews the results and you receive your own summary. Your results are confidential and are never used on their own to make decisions about your employment. If you have a question, or need an adjustment such as extra time, use "Questions or concerns" in FocusiQ before you begin.',
        '',
        'Thank you,',
        'Walter Geering'
      ];
    when 'assessment_completed' then
      subject := 'Thank you – your FocusiQ assessment is complete';
      lines := array['Thank you for completing your FocusiQ assessment. Your answers have been saved. Walter Geering will review them and you will receive your own summary afterwards. You can sign in to FocusiQ at any time:', '{{link}}'];
    else raise exception 'Unknown notification kind %', p_kind;
  end case;
  body := focusiq.focusiq_email_body(p_name, lines);
end $$;
