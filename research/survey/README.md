# Survey v2: design and analysis plan

`rebuild_survey_v2.gs` rebuilds the live Google Form in place (same link). It has 18 required
questions, 17 of them one tap, plus 3 optional; about 3 minutes. People who rarely do live shows skip
the 6 stage questions, so their path is about 2 minutes.

## Why it is built this way

| Choice | Reason |
| --- | --- |
| 18 required + 3 optional questions, ~3 min | Drop-off rises fastest over the first ~15 questions and once surveys pass ~7–8 minutes ([SurveyMonkey](https://www.surveymonkey.com/curiosity/survey_questions_and_completion_rates/), [Qualtrics](https://www.qualtrics.com/articles/strategy-research/4-tips-for-preventing-drop-offs-in-surveys/)) |
| Progress bar, honest "3 minutes" | Progress bars help only when the survey is no longer than promised |
| Name and email first, then role and frequency; demographics last | Contact details up front make every response identifiable for the draw and deduplication; the help text ties them to the prize. Easy role questions build momentum; demographics come when people are invested |
| Pain questions before the product idea | Describing the product first would bias the pain answers |
| Branching on live-show frequency | Fans and students skip stage questions instead of guessing |
| "Not sure" / "Prefer not to say" options | Forced answers create fake data; these keep answers honest |
| One optional open question | Open text is the slowest to answer; one keeps the qualitative signal |
| Draw rules in the form | No purchase necessary, 18+, dates, prize, free entry route, "void where prohibited" |

## Variables

| Variable | Question | Type | Use |
| --- | --- | --- | --- |
| `role` | Which best describes you? | nominal (+ other) | segment / persona |
| `live_freq` | How often do you perform or work at live shows | ordinal 1–4 | segment; branch |
| `audience` | Typical audience size | ordinal 1–5 | segment (scale of shows) |
| `lyric_method` | How performers see lyrics (multi) | multi-select → one 0/1 column each | current solution |
| `error_freq` | Lyrics late/early/wrong per show | ordinal 0–3, "Not sure" = missing | pain frequency |
| `error_severity` | How much it hurts | 1–5 | pain severity |
| `prep_time` | Cue prep per song | ordinal 0–4, "Not my job" = missing | CueBuilder value |
| `spend` | Yearly spend on tools/operators | ordinal 0–4, "Not sure" = missing | willingness-to-pay proxy |
| `usefulness` | How useful would this be | 1–5 | demand |
| `wtp` | What would you pay per month | ordinal 0–4, "Not my decision" = separate flag | price |
| `pilot` | Try it free next month | Yes / Maybe / No / N/A | pilot pipeline |
| `trust_note` | What would make you trust it (optional) | text | themes |
| `age` | Age band | ordinal, "Prefer not" = missing | bias check, persona |
| `gender` | Gender | nominal | bias check |
| `region` | Where based | nominal | bias check (LA-heavy sample) |
| `source` | How did you hear about this | nominal | recruitment bias |
| `name`, `email` | Contact | PII | draw, follow-up, dedupe |
| `draw` | Enter draw | Yes / No | draw eligibility |
| `followup` | Chat / free test (optional) | multi-select | interview and pilot list |
| `org` | Band, church, venue (optional) | text | account mapping |

## Analysis plan

1. **Clean:** drop duplicate emails (keep the first), drop answers finished in under 60 seconds
   (speeders), keep "Not sure" as missing rather than as a middle value.
2. **Pain score:** `error_freq × error_severity` (0–15) per respondent; compare by `role`.
3. **Personas:** cluster on `role`, `live_freq`, `audience`, `lyric_method` and the pain score (k-modes or
   simple cross-tabs at this sample size). Likely groups: worship volunteers, gigging bands, touring
   crew, fans/students. Describe each with its median pain, spend, usefulness and willingness to pay.
4. **Bias checks:** compare answers by `source` and `region`. If people recruited by us directly score
   usefulness much higher than strangers, report both numbers. Report the sample's age and gender mix
   next to any headline number.
5. **Demand evidence for SHIP:** share of performers/crew with pain score ≥ 6 who say "Yes" to a free
   test; count of follow-up opt-ins.

## Privacy

Names and emails are only for the draw and opted-in follow-up. Before sharing data, delete `name`,
`email` and `org`, and analyze by respondent number.
