# Digital practice imports

Put source PDFs in `Practise tests/<year>/`. The importer preserves printed
text, diagrams and tables as question images with native answer controls.
It does not create verified answer keys or an official SAT score.

Install Python dependencies `pymupdf numpy Pillow scipy` and Tesseract with
English language data, then run from the repository root:

```sh
python3 scripts/digitize_practice_tests.py --workers 4
python3 scripts/digitize_practice_tests.py --only 'file-name fragment' --force
python3 -m unittest discover -s scripts -p test_digitize_practice_tests.py
```

Generated WebP assets and manifests stay in the ignored
`Practise tests/.digital/` directory. Optional local digit templates may be
placed at `.digital/digit-templates.json`; without them, Tesseract reads
question numbers. `--tesseract` can select a non-system executable.

All automatic imports are drafts. Compare question counts, numbering,
passages, crop boundaries, answer formats, sections and timing with every
source page before treating a test as complete. Older papers and photographed
screens need particular care. The manifest records detected issues; no issues
does not prove completeness. The website displays the source-review warning
for every automatic import and does not grade unverified answers.

Answers and review flags are saved locally per signed-in user and test.
Module deadlines continue while the tab is closed. There is no cross-device
progress synchronization for these imported tests.
