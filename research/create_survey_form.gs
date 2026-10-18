/**
 * Creates the Syncopate customer-discovery questionnaire as a Google Form, plus a linked
 * response spreadsheet, in the Google account that runs it.
 *
 * How to run (about 2 minutes):
 *   1. Go to https://script.google.com and click "New project".
 *   2. Delete the sample code, paste this whole file, and click Save.
 *   3. Choose createSyncopateSurvey in the function menu and click Run.
 *   4. Approve the permissions prompt (Forms + Sheets in your own Drive).
 *   5. Open View > Logs (or Execution log): it prints the link to share and the edit link.
 *
 * Question order follows the "don't pitch first" rule: we ask how lyrics and cues work
 * today before describing the product, so answers aren't steered by the idea.
 */
function createSyncopateSurvey() {
  var form = FormApp.create('Live Lyrics & Stage Prompting Survey');
  form
    .setDescription(
      'We are two USC students (Lucy Li and Kushal Bhanot) researching how performers, crews and worship ' +
        'teams handle lyrics on stage: teleprompters, confidence monitors and lyric screens for audiences.\n\n' +
        'It takes about 8 minutes. Every question except the first is optional. Answers are used only for ' +
        'our research in the USC SHIP program and are never shared or sold. Contact details are only for ' +
        'follow-up if you choose to give them.'
    )
    .setProgressBar(true)
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setConfirmationMessage(
      'Thank you! If you left your contact details, Lucy will reach out about a short follow-up call.'
    );

  // ---------------------------------------------------------------- Section 1: About you
  form
    .addMultipleChoiceItem()
    .setTitle('Which best describes you?')
    .setChoiceValues([
      'Touring crew: playback tech, prompter operator or monitor engineer',
      'Musical director or band leader',
      'Worship team: musician, singer, tech or production director',
      'Gigging musician or singer (cover, wedding, original band, solo)',
      'Front-of-house, video, LED or media-server operator',
      'Music student',
      'Venue or production company staff',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('How many years have you worked or performed live?')
    .setChoiceValues(['Less than 1', '1–3', '4–10', 'More than 10']);

  form
    .addMultipleChoiceItem()
    .setTitle('How many live shows, services or gigs are you part of in a typical month?')
    .setChoiceValues(['0', '1–2', '3–8', '9–20', 'More than 20']);

  form
    .addMultipleChoiceItem()
    .setTitle('What is the typical audience size at those shows?')
    .setChoiceValues(['Under 100', '100–1,000', '1,000–5,000', '5,000–20,000', 'Over 20,000']);

  // ---------------------------------------------------------------- Section 2: Lyrics today
  form
    .addPageBreakItem()
    .setTitle('How lyrics work at your shows today')
    .setHelpText('Think about the shows, services or gigs you are most often part of.');

  form
    .addMultipleChoiceItem()
    .setTitle('Do the performers at your shows use lyric prompts on stage?')
    .setHelpText('A teleprompter, confidence monitor, iPad, music stand or anything similar.')
    .setChoiceValues(['Always', 'Sometimes', 'Never', 'Not sure']);

  form
    .addCheckboxItem()
    .setTitle('How are lyrics shown? (select all that apply)')
    .setChoiceValues([
      'Paper lyric sheets or set lists',
      'Tablet app on a stand (e.g. OnSong, QMe Prompter, ForScore)',
      'Teleprompter or floor wedge scrolled by a person',
      'Teleprompter run automatically from timecode or playback (e.g. Ableton, HiWire)',
      'Presentation software (e.g. ProPresenter, EasyWorship)',
      'Lyrics on audience screens or LED walls',
      'No lyrics are shown',
    ])
    .showOtherOption(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Who usually advances the lyrics or slides during a show?')
    .setChoiceValues([
      'The performer (foot pedal, tap or scroll)',
      'A paid operator',
      'A volunteer',
      'It is automated (timecode, playback or voice-following software)',
      'Nobody: lyrics are not advanced',
    ])
    .showOtherOption(true);

  form
    .addMultipleChoiceItem()
    .setTitle('In a typical show, how often are lyrics or slides late, early or on the wrong line?')
    .setChoiceValues(['Never', '1–2 times', '3–5 times', '6 or more times', "I don't know"]);

  form
    .addScaleItem()
    .setTitle('When that happens, how much does it affect the performance or the audience?')
    .setBounds(1, 5)
    .setLabels('Barely noticeable', 'Seriously disruptive');

  form
    .addParagraphTextItem()
    .setTitle('Tell us about the last time lyrics or slides went wrong during a show. What happened, and what did you do?');

  form
    .addMultipleChoiceItem()
    .setTitle('How often do performers change the song live, e.g. skip a verse, repeat a chorus or extend a section?')
    .setChoiceValues(['Never', 'Occasionally', 'Most shows', 'Every show', "I don't know"]);

  // ---------------------------------------------------------------- Section 3: Preparation
  form
    .addPageBreakItem()
    .setTitle('Preparing a show')
    .setHelpText('Getting lyrics, cues and timings ready before a tour, service or gig.');

  form
    .addMultipleChoiceItem()
    .setTitle('Roughly how long does it take to prepare lyric cues or timings for ONE song?')
    .setChoiceValues([
      'No preparation is needed',
      'Under 5 minutes',
      '5–15 minutes',
      '15–60 minutes',
      '1–3 hours',
      'More than 3 hours',
      "It's not my job / I don't know",
    ]);

  form
    .addTextItem()
    .setTitle('Who does that preparation? (role, not name)');

  form
    .addMultipleChoiceItem()
    .setTitle('How often does the set list or song arrangement change after cues are prepared?')
    .setChoiceValues(['Never', 'Rarely', 'Every few shows', 'Most shows']);

  form
    .addParagraphTextItem()
    .setTitle('What is the most frustrating part of preparing or running lyrics for a show?');

  // ---------------------------------------------------------------- Section 4: Tools and cost
  form
    .addPageBreakItem()
    .setTitle('Tools and cost');

  form
    .addCheckboxItem()
    .setTitle('Which tools do you or your team use? (select all that apply)')
    .setChoiceValues([
      'ProPresenter',
      'EasyWorship or another presentation tool',
      'Planning Center',
      'Ableton Live or another playback rig',
      'MultiTracks Playback or Loop Community Prime',
      'HiWire Prompter',
      'OnSong',
      'QMe Prompter',
      'PromptSmart or another teleprompter app',
      'Resolume, disguise or another media server',
      'None of these',
    ])
    .showOtherOption(true);

  form
    .addMultipleChoiceItem()
    .setTitle('About how much do you or your organisation spend per year on lyric, prompter or presentation software?')
    .setChoiceValues(['Nothing', 'Under $50', '$50–$200', '$200–$1,000', 'Over $1,000', "I don't know"]);

  form
    .addTextItem()
    .setTitle('If someone is paid to operate lyrics or a prompter, what is the typical rate? (e.g. $500/day, $2,000/week)');

  form
    .addGridItem()
    .setTitle('How big a problem is each of these for you?')
    .setRows([
      'Lyrics late or on the wrong line during a show',
      'Time spent preparing lyric cues',
      'Last-minute set list or arrangement changes',
      'Audience screen lyrics out of sync with the singer',
      'Cost of operators or software',
      'Finding someone reliable to run lyrics',
    ])
    .setColumns(['Not a problem', 'Minor', 'Moderate', 'Major', 'N/A']);

  // ---------------------------------------------------------------- Section 5: The idea
  form
    .addPageBreakItem()
    .setTitle('An idea we are testing')
    .setHelpText(
      'We are building software that listens to one rehearsal recording and times every lyric line ' +
        'automatically. During the show it listens to the singer and keeps the stage prompter and the ' +
        'audience screens in sync, even if they skip or repeat a section. A person can always take over.'
    );

  form
    .addScaleItem()
    .setTitle('How useful would this be for you or your team?')
    .setBounds(1, 5)
    .setLabels('Not useful', 'Extremely useful');

  form
    .addCheckboxItem()
    .setTitle('What would you need before trusting it at a real show? (select all that apply)')
    .setChoiceValues([
      'A person can override it instantly',
      'Proof of accuracy (e.g. a test at our own rehearsal)',
      'Works offline, with no internet at the venue',
      'Works with the tools we already use',
      'No noticeable delay',
      'Recommendations from people I trust',
    ])
    .showOtherOption(true);

  form
    .addParagraphTextItem()
    .setTitle('What is your biggest concern or doubt about a tool like this?');

  form
    .addMultipleChoiceItem()
    .setTitle('If it worked reliably, what would you expect to pay?')
    .setChoiceValues([
      "I wouldn't pay for it",
      'Only if it were free',
      'Up to $10 per month',
      '$10–$30 per month',
      '$30–$100 per month',
      'More than $100 per month',
      'A per-show or per-tour fee',
      'It depends',
    ]);

  form
    .addMultipleChoiceItem()
    .setTitle('Would you try a free test at one of your rehearsals or shows in the next 4 weeks?')
    .setChoiceValues(['Yes', 'Maybe', 'No']);

  // ---------------------------------------------------------------- Section 6: Follow-up
  form
    .addPageBreakItem()
    .setTitle('Stay in touch (optional)');

  form
    .addMultipleChoiceItem()
    .setTitle('May we contact you for a 15-minute follow-up call?')
    .setChoiceValues(['Yes', 'No']);

  form
    .addTextItem()
    .setTitle('Name and best way to reach you (email or phone)');

  form
    .addTextItem()
    .setTitle('Organisation, band, church or tour (optional)');

  form
    .addParagraphTextItem()
    .setTitle('Is there anyone else we should talk to? (name, role, how to reach them)');

  // Responses go to a spreadsheet so Lucy can filter and count them.
  var sheet = SpreadsheetApp.create('Live Lyrics & Stage Prompting Survey (Responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  // Newer forms can start unpublished; publish if this account supports the setting.
  try {
    form.setPublished(true);
  } catch (e) {
    // Older Forms accounts are published on creation.
  }

  Logger.log('Share this link with respondents: ' + form.getPublishedUrl());
  Logger.log('Edit the form here: ' + form.getEditUrl());
  Logger.log('Responses spreadsheet: ' + sheet.getUrl());
}
