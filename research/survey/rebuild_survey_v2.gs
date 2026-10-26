/**
 * Syncopate survey v2: rebuilds the existing Google Form IN PLACE (same link) as a short,
 * mostly-tap survey with persona and bias variables and a $100 gift card draw.
 *
 * Run it from the Google account that owns the form (bhanotk@usc.edu):
 *   1. script.google.com → New project → paste this file → Save.
 *   2. Choose rebuildSurvey in the function menu → Run → approve the permissions prompt.
 *   3. View → Execution log: it prints the share link, a short link and the new responses sheet.
 *
 * Safety: existing responses are copied to a backup spreadsheet before the old questions are
 * removed, then cleared so old and new answers don't mix in one table.
 *
 * Design notes (see README.md in this folder):
 * - 18 required questions (all one tap except name and email) plus 3 optional, about 3 minutes.
 *   Drop-off rises fastest in the first ~15 questions and past ~7–8 minutes, so every question
 *   has to earn its place.
 * - Name and email first (tied to the draw), then easy questions about their role; product idea
 *   only after the pain questions (no priming); demographics last, framed as "enter the draw".
 * - People who rarely do live shows skip the stage questions (branching), so nobody answers
 *   questions that don't apply to them, and their answers don't pollute the performer data.
 * - Ordinal answers use consistent, non-overlapping bins with a "Not sure" escape hatch, so
 *   nobody is forced to guess. "How did you hear about this?" tracks recruitment bias.
 */

var FORM_ID = '1deUoYMk0bjwlB81sdkqnLlLtIVIVik67AzgJnCuipq4';
var CONTACT_EMAIL = 'bhanotk@usc.edu';
var BANNER_URL = 'https://raw.githubusercontent.com/KushalBhanot/syncopate/main/research/survey/banner.png';
var DRAW_DEADLINE = 'Thursday, October 30, 2026 at 11:59 PM Pacific Time';
var DRAW_DATE = 'October 31, 2026';

function rebuildSurvey() {
  var form = FormApp.openById(FORM_ID);

  backupAndClearResponses_(form);
  form.getItems().forEach(function (item) {
    form.deleteItem(item);
  });

  // ---------------------------------------------------------------- Form settings
  form
    .setTitle('Lyrics on stage: 3-minute survey 🎤')
    .setDescription(
      'Ever seen a singer lose their place, or lyrics on the screen lag behind the band? ' +
        "We're Kushal Bhanot and Luyi Li, two USC students building a tool that keeps stage lyrics " +
        'in sync automatically, and we want to learn how it really works at your shows.\n\n' +
        '🎁 Finish by ' + DRAW_DEADLINE + ' for a chance to win a $100 gift card: Nike, Sephora or ' +
        'Steam Wallet, your choice. 18+ only. No purchase necessary. Rules are at the end.\n\n' +
        '⏱️ About 3 minutes, mostly one tap per question. 🔒 Your answers are only used for our research ' +
        'and are never shared or sold.'
    )
    .setProgressBar(true)
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false);
  try {
    form.setRequireLogin(false); // open to people outside USC (no Google sign-in needed)
  } catch (e) {
    Logger.log('Could not change the sign-in requirement: ' + e);
  }
  try {
    form.setLimitOneResponsePerUser(false); // limiting needs sign-in; duplicates are removed by email
  } catch (e) {}

  // The banner is the theme's header image (Customize theme → Header → By URL → BANNER_URL).
  // Apps Script can't set themes, but the header survives re-runs of this script.

  // ---------------------------------------------------------------- Page 1: you and live music
  // Name and email come first so every response is identifiable for the draw and for removing
  // duplicates; the help text says why we ask.
  form
    .addTextItem()
    .setTitle('Your name')
    .setHelpText('So we know who to congratulate if you win the $100 draw.')
    .setRequired(true);

  form
    .addTextItem()
    .setTitle('Email')
    .setHelpText('Only used to contact the draw winner, and you if you ask us to follow up. Never shared.')
    .setValidation(
      FormApp.createTextValidation().requireTextIsEmail().setHelpText('Please enter a valid email').build()
    )
    .setRequired(true);

  var role = form
    .addMultipleChoiceItem()
    .setTitle('Which best describes you?')
    .setHelpText('Pick the one that fits most of the time.')
    .setChoiceValues([
      'Singer or musician (band, solo, cover, wedding)',
      'Worship team (musician, singer or tech)',
      'Stage or production crew (playback, prompter, monitors, FOH, video, LED)',
      'Music director or band leader',
      'Music student',
      'Venue, event or production company staff',
      'Music fan who goes to live shows',
    ])
    .showOtherOption(true)
    .setRequired(true);

  var frequency = form
    .addMultipleChoiceItem()
    .setTitle('How often do you perform or work at live shows, gigs or services?')
    .setRequired(true);
  // Choices are set after the pages exist (they decide where people go next).

  // ---------------------------------------------------------------- Page 2: lyrics at your shows
  form
    .addPageBreakItem()
    .setTitle('🎶 Lyrics at your shows')
    .setHelpText('Think about the shows you do most often. About 1 minute.');

  form
    .addMultipleChoiceItem()
    .setTitle('Typical audience size')
    .setChoiceValues(['Under 100', '100–500', '500–2,000', '2,000–10,000', 'Over 10,000'])
    .setRequired(true);

  form
    .addCheckboxItem()
    .setTitle('How do performers see the lyrics on stage?')
    .setHelpText('Select all that apply.')
    .setChoiceValues([
      "They don't: everything is memorized",
      'Paper lyric sheets or set lists',
      'An app on a tablet or phone',
      'A teleprompter or screen that a person scrolls',
      'A teleprompter run automatically (timecode or playback)',
      'Slides in presentation software (e.g. ProPresenter)',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('In a typical show, how often are lyrics or slides late, early or on the wrong line?')
    .setChoiceValues(['Never', 'Once or twice', '3–5 times', '6 or more times', 'Not sure'])
    .setRequired(true);

  form
    .addScaleItem()
    .setTitle('When it happens, how much does it hurt the performance?')
    .setBounds(1, 5)
    .setLabels('Barely noticeable', 'Seriously disruptive')
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('How long does it take to get lyrics or cues ready for one song?')
    .setChoiceValues([
      'No preparation needed',
      'Under 5 minutes',
      '5–15 minutes',
      '15–60 minutes',
      'Over an hour',
      "Not my job / not sure",
    ])
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Roughly how much is spent per year on lyric, prompter or slide software, or on people to run it?')
    .setChoiceValues(['$0', 'Under $100', '$100–$500', '$500–$2,000', 'Over $2,000', 'Not sure'])
    .setRequired(true);

  // ---------------------------------------------------------------- Page 3: the idea (everyone)
  var ideaPage = form
    .addPageBreakItem()
    .setTitle('💡 An idea we are testing')
    .setHelpText(
      'Upload one rehearsal recording and our software times every lyric automatically. During the ' +
        'show it listens to the singer and keeps the stage prompter and the audience screens in sync, ' +
        'even when a verse is skipped or a chorus repeated. A person can always take over.'
    );

  form
    .addScaleItem()
    .setTitle('How useful would this be for you, or for the shows you go to?')
    .setBounds(1, 5)
    .setLabels('Not useful', 'Extremely useful')
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('If it worked reliably, what would you (or your team) pay for it?')
    .setChoiceValues([
      'Nothing, only if free',
      'Up to $10 a month',
      '$10–$30 a month',
      '$30–$100 a month',
      'Over $100 a month',
      'Not my decision',
    ])
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Would you try it for free at a rehearsal or show in the next month?')
    .setChoiceValues(['Yes', 'Maybe', 'No', "Doesn't apply to me"])
    .setRequired(true);

  form
    .addParagraphTextItem()
    .setTitle("Optional: what would make you trust it at a real show, or what's your biggest doubt?");

  // ---------------------------------------------------------------- Page 4: about you + draw
  form
    .addPageBreakItem()
    .setTitle('🎁 Last step: enter the $100 draw')
    .setHelpText('A few quick details so we can understand who answered. About 30 seconds.');

  form
    .addMultipleChoiceItem()
    .setTitle('Age')
    .setChoiceValues(['Under 18', '18–24', '25–34', '35–44', '45–54', '55 or older', 'Prefer not to say'])
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Gender')
    .setChoiceValues(['Woman', 'Man', 'Non-binary', 'Prefer not to say'])
    .showOtherOption(true) // shown as "Other:" with a text box for self-description
    .setRequired(true);

  form
    .addListItem()
    .setTitle('Where are you based?')
    .setChoiceValues([
      'Los Angeles area',
      'Elsewhere in California',
      'Elsewhere in the US',
      'Outside the US',
    ])
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('How did you hear about this survey?')
    .setChoiceValues([
      'From Kushal or Luyi directly',
      'A friend or colleague',
      'USC (class, club, Thornton)',
      'My church or worship network',
      'Social media',
      'A music community, forum or group chat',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Enter me in the $100 gift card draw')
    .setChoiceValues(["Yes, I'm 18 or older and accept the rules below", 'No thanks'])
    .setRequired(true);

  form
    .addCheckboxItem()
    .setTitle('Optional: can we follow up?')
    .setChoiceValues(['Yes, a 15-minute chat is fine', "Yes, I'd like a free test at a rehearsal or show"]);

  form
    .addTextItem()
    .setTitle('Optional: band, church, venue or tour you work with');

  form
    .addSectionHeaderItem()
    .setTitle('Draw rules')
    .setHelpText(
      'No purchase necessary to enter or win. Open to people 18 or older; void where prohibited. ' +
        'Entry period: from launch until ' + DRAW_DEADLINE + '. Enter by completing this survey and ' +
        'choosing "Yes" above, or without the survey by emailing your name to ' + CONTACT_EMAIL + ' ' +
        'before the deadline. One entry per person; duplicate emails count once. ' +
        'Prize: one $100 gift card, winner chooses Nike, Sephora or Steam Wallet. ' +
        'One winner is chosen at random from eligible entries on or about ' + DRAW_DATE + ' and notified ' +
        'by email; if they do not reply within 7 days, another winner is drawn. Odds depend on the number ' +
        'of eligible entries. Run by Kushal Bhanot and Luyi Li, USC students. Not sponsored, endorsed or ' +
        'administered by USC, Nike, Sephora or Valve (Steam). Questions: ' + CONTACT_EMAIL + '.'
    );

  // ---------------------------------------------------------------- Branching
  // People who rarely do live shows skip the stage questions and go straight to the idea.
  frequency.setChoices([
    frequency.createChoice('Every week or more', FormApp.PageNavigationType.CONTINUE),
    frequency.createChoice('A few times a month', FormApp.PageNavigationType.CONTINUE),
    frequency.createChoice('A few times a year', FormApp.PageNavigationType.CONTINUE),
    frequency.createChoice('Rarely or never', ideaPage),
  ]);

  // ---------------------------------------------------------------- Responses sheet + confirmation
  var previousSheetId = null;
  try {
    previousSheetId = form.getDestinationId();
    form.removeDestination();
  } catch (e) {}
  var sheet = SpreadsheetApp.create('Syncopate survey v2 responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  if (previousSheetId) {
    // A re-run leaves the earlier sheet unlinked; label it so nobody analyses the wrong file.
    var previous = SpreadsheetApp.openById(previousSheetId);
    previous.rename(previous.getName() + ' (previous run, safe to delete if empty)');
  }

  var link = form.getPublishedUrl();
  try {
    link = form.shortenFormUrl(link);
  } catch (e) {}
  form.setConfirmationMessage(
    "Thank you, you're done! 🎉 If you entered the draw, we'll pick the winner on " + DRAW_DATE +
      ' and email them.\n\nKnow a musician, worship team or stage tech? Send them this link, ' +
      "it really helps us: " + link
  );
  try {
    form.setPublished(true);
  } catch (e) {}

  Logger.log('Questions: ' + form.getItems().filter(isQuestion_).length);
  Logger.log('Share this link: ' + link);
  Logger.log('Edit the form: ' + form.getEditUrl());
  Logger.log('Responses sheet: ' + sheet.getUrl());
}

function isQuestion_(item) {
  var t = item.getType();
  return t != FormApp.ItemType.PAGE_BREAK && t != FormApp.ItemType.SECTION_HEADER && t != FormApp.ItemType.IMAGE;
}

/** Copies every existing response into a new spreadsheet, then clears them from the form. */
function backupAndClearResponses_(form) {
  var responses = form.getResponses();
  if (!responses.length) return;
  var titles = form.getItems().filter(isQuestion_).map(function (i) {
    return i.getTitle();
  });
  var rows = [['Timestamp', 'Respondent email'].concat(titles)];
  responses.forEach(function (r) {
    var byTitle = {};
    r.getItemResponses().forEach(function (ir) {
      var v = ir.getResponse();
      byTitle[ir.getItem().getTitle()] = Array.isArray(v) ? v.join('; ') : String(v);
    });
    rows.push(
      [r.getTimestamp(), r.getRespondentEmail() || ''].concat(
        titles.map(function (t) {
          return byTitle[t] || '';
        })
      )
    );
  });
  var backup = SpreadsheetApp.create('Syncopate survey v1 backup (' + new Date().toISOString().slice(0, 10) + ')');
  backup.getSheets()[0].getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('Backed up ' + responses.length + ' response(s) to: ' + backup.getUrl());
  form.deleteAllResponses();
}

/** Read-only check: logs every item with its type, title and choices. Run after manual edits. */
function listItems() {
  var form = FormApp.openById(FORM_ID);
  form.getItems().forEach(function (item, i) {
    var type = String(item.getType());
    var extra = '';
    try {
      if (type == 'MULTIPLE_CHOICE') extra = item.asMultipleChoiceItem().getChoices().map(function (c) { return c.getValue(); }).join(' / ');
      if (type == 'CHECKBOX') extra = item.asCheckboxItem().getChoices().map(function (c) { return c.getValue(); }).join(' / ');
      if (type == 'LIST') extra = item.asListItem().getChoices().map(function (c) { return c.getValue(); }).join(' / ');
    } catch (e) {
      extra = 'ERR ' + e;
    }
    Logger.log(i + ' | ' + type + ' | title="' + item.getTitle() + '" | ' + extra);
  });
}

/** Adds back "Your name" (first question) and the pain-severity scale if they were deleted. */
function restoreMissing() {
  var form = FormApp.openById(FORM_ID);
  var titles = form.getItems().map(function (i) { return i.getTitle(); });
  if (titles.indexOf('Your name') < 0) {
    var name = form
      .addTextItem()
      .setTitle('Your name')
      .setHelpText('So we know who to congratulate if you win the $100 draw.')
      .setRequired(true);
    form.moveItem(name.getIndex(), 0);
    Logger.log('Restored: Your name');
  }
  titles = form.getItems().map(function (i) { return i.getTitle(); });
  var scaleTitle = 'When it happens, how much does it hurt the performance?';
  var lateIndex = titles.indexOf('In a typical show, how often are lyrics or slides late, early or on the wrong line?');
  if (titles.indexOf(scaleTitle) < 0 && lateIndex >= 0) {
    var scale = form
      .addScaleItem()
      .setTitle(scaleTitle)
      .setBounds(1, 5)
      .setLabels('Barely noticeable', 'Seriously disruptive')
      .setRequired(true);
    form.moveItem(scale.getIndex(), lateIndex + 1);
    Logger.log('Restored: severity scale');
  }
  listItems();
}
