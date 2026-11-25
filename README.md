# Recycle and build (ממחזרים ובונים): Arabic version

The Arabic build of the lomda. The five narrated videos are in Arabic (`assets/videos/video-open|council|cart|goal|end.mp4`, captions timed to the recordings). The eight narration recordings in `assets/audio` are still silent placeholders of the original length; the Arabic recordings go in under the same names.

- Hebrew source: github.com/methodicelElearnig/STEM-Recycle-and-build (pinned copy and commit in the workspace's `he-source.txt`).
- `index.html`, `script.js` and `styles.css` come from the Hebrew lomda; `styles.css` is identical to the Hebrew. The Arabic is written into `index.html` and `script.js`; `style-ar.css` and `fonts-ar.css` (Almarai) adapt the layout to Arabic.
- Text painted into the pictures and videos, and what is still Hebrew there: `ASSET_LOCALIZATION.md`.
- This repo is **generated** from the translation master by the Arabic workspace (`rebuild-ar.sh`). Do not edit the files here: correct the translation or the style files in the workspace and rebuild.
