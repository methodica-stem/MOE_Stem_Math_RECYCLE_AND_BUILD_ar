# Hebrew painted into artwork and video: Recycle (ממחזרים ובונים)

Built 2026-11-11 for the Arabic build `STEM-Recycle-and-build-AR` (Hebrew source `c57fc7e`). Nothing here is redrawn by the build:
the skill's rule is to list it, with a proposed Arabic and a call on whether it blocks release.
**All Arabic below is Claude's proposal (PENDING): the Arabic reviewer / translator confirms it before an artist uses it.**

**Update 2026-11-24:** the six pictures `project-bg`, `deposit-value-bg`, `dream-bg`, `finish-bg`, `bg-street-dim` and `bg-garden-dim` now exist in real Arabic in `assets-ar/images/` (made by Yael, checked against the originals). Still Hebrew: the two video posters (`video-cart-poster.jpg`, `video-end-poster.jpg`) and the videos themselves.

## How the list was made

- Contact sheets of all 31 files in `assets/images/`, looked at by eye (an automated text sweep reads live text only;
  none of the items below is in the code, and the pictures have `alt=""`).
- A frame scan of the five narrated videos every 2.5 s (plus the last frames), as contact sheets.
- A screenshot of every screen of the Arabic build after its reveals.

## Artwork (images shipped in `assets/images/`)

| File | Where it shows | Hebrew in the picture | Proposed Arabic (PENDING) | Call |
|---|---|---|---|---|
| `project-bg.jpg` | Screen 3 (project), full screen | The board the children hold: **"ממחזרים ובונים"** (the lomda's name) | نعيد التدوير ونبني | Should fix: the most visible Hebrew in the lomda |
| | | Green shop sign **"הפינה / סופרמרקט שכונתי"** | الزاوية / سوبرماركت الحي | Should fix |
| | | Opening-hours board **"שעות פתיחה / א'–ה' 08:00–21:00 / ו' 08:00–15:00 / שבת 09:00–22:00"** | ساعات الدوام / الأحد–الخميس 08:00–21:00 / الجمعة 08:00–15:00 / السبت 09:00–22:00 | Should fix (partly hidden behind the text panel) |
| `deposit-value-bg.jpg` | Screen 4 (deposit value), full screen | Machine sign **"מיחזור בקבוקים / כל בקבוק נחשב! / תודה שאתם ממחזרים!"** | إعادة تدوير الزجاجات / كل زجاجة مهمّة! / شكرًا لأنكم تعيدون التدوير! | Should fix: it carries the idea of the screen |
| | | Lower machine sign **"בקבוק בחזרה – עולם טוב יותר"** | زجاجة تعود – عالم أفضل | Should fix |
| | | Green sign **"ממחזרים היום / למחר טוב יותר"** (right of the machine) | نعيد التدوير اليوم / لغدٍ أفضل | Should fix |
| | | Shop sign **"הפינה / סופרמרקט שכונתי"**; brand lettering on the water bottles on the shelves | as above; check the bottle labels at full size | Should fix / check |
| `dream-bg.jpg` | Screen 2 (dream), thought bubble | Chalkboard on the garden wall **"המקום שלנו"** | مكاننا | Decorative, small |
| `finish-bg.jpg` | Screen 20 (finish) | Chalkboard **"המקום שלנו"** (large, left) | مكاننا | Should fix: clearly readable behind the score |
| `bg-street-dim.jpg` | Screens 9 and 10 (Q3, Q4), dimmed behind the white card | Shop sign **"הפינה"** | الزاوية | Decorative: barely visible |
| `bg-garden-dim.jpg` | Screens 17 and 18 (Q7, Q8), dimmed behind the card | Chalkboard **"המקום שלנו"** | مكاننا | Decorative: barely visible |
| `video-cart-poster.jpg`, `video-end-poster.jpg` | Poster frames of screens 8 and 19 | "הפינה" / "המקום שלנו" (same pictures as the video frames below) | as above | Goes away when the Arabic videos replace the posters |
| `q4-coin-10.png` | Screen 10 (Q4) help | **"אגורות"** on the face of a 10-agorot coin | — | **Leave**: it is a real coin and real Israeli coins carry Hebrew. Decision for the content owner if they disagree |
| `q4-coin-shekel.png` | Screen 10 (Q4) help | The numeral and the coin's small lettering | — | Leave: real coin |

Looked at and clean: `bg-council-room`, `bg-room-dim` (recycling symbol and a light-bulb drawing only), `letter-bg`
(crest, no words), `letter-intro-first`, the characters, and the UI buttons (`ui-btn-check`, `ui-btn-help` are blank:
their labels are live text; the arrows are symbols).

## Videos (to be re-produced in Arabic)

Five narrated videos plus one silent animation (`letter-intro.mp4`, no words, shipped as it is).
The Hebrew narration and the on-screen Hebrew are listed per video in `VIDEO_SCRIPT_AR.docx`. On-screen text to re-make:

| Video | Screen | Frames | Hebrew on screen | Proposed Arabic (PENDING) |
|---|---|---|---|---|
| `video-cart` | 8 | 0:00 to about 0:17, every shot | Blue supermarket sign **"הפינה"** (also in the street) | الزاوية |
| `video-end` | 19 | about 0:02 to 0:06 | Chalkboard **"המקום שלנו"** | مكاننا |
| `video-open`, `video-council`, `video-goal` | 1, 5, 11 | — | none readable (the lettering on the cream hoodie is stylised, not words) | — |

Smaller red and orange shop signs in the street of `video-cart` are out of focus at the size scanned: check them in the
source files.

## Audio

Eight narration recordings play on their own, outside the videos (screens 2, 3, 4, 7, 12, 15, 16, 18: listed in
`VIDEO_SCRIPT_AR.docx` under "Audio outside the videos", with the Arabic text each reads). They are Hebrew voices.
No song, no sound effects.

## What the Arabic build ships instead, for now

The Arabic videos and recordings do not exist yet. `assets-ar/videos` and `assets-ar/audio` hold **silent placeholders
of the same name and length** (`tools/make_placeholders.py`): a video shows its poster frame, an audio file is silence.
Captions (live text, timed to the Hebrew cut) and every flow (play, forward arrow at the end, speaker button,
"أريد أن أسمع!") work as they will with the real media. The Hebrew voices are never copied into the build. When the
Arabic files arrive, put them in the same folders under the same names; the caption times are then re-timed
(`retime_captions.py`, as on the other units).

## Blocking?

Nothing here blocks the mathematics. Before a school release: the screen 3 board, the screen 4 machine signs, and the
finish-screen chalkboard should be redrawn (the most visible), then the rest.
