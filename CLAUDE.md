# Stories

Static site on GitHub Pages (branch `main`, repo root, `.nojekyll`): https://dnegorweb.github.io/stories/
It shows English texts where tapping a word pops up its Russian translation. No build step, no dependencies, no API calls.

- `index.html`: the story list plus search. The tool inserts items after `<!-- stories:start -->`, newest first.
- `texts/<slug>.html`: generated story pages. Each one embeds its own dictionary as `window.DICT`.
- `assets/reader.js`: wraps dictionary words in tappable spans and shows the popup. `assets/style.css` holds the shared styles.
- `tools/story.mjs`: the page generator (Node, no deps). Its tokenizer must stay in sync with `assets/reader.js`.

## Adding a story (the usual task)

The user gives a text file. The first line is the title (otherwise pass `--title "…"`). Paragraphs are separated by blank lines.
A paragraph that is only `***` (or `* * *`) becomes an ornamental section break (`<hr class="sep">`, styled in `style.css`;
a CSS counter numbers the breaks in each article).
When the user asks for breaks after certain paragraphs, add those marker paragraphs to the text before building. On an
already generated page, insert `<hr class="sep">` lines between the `<p>` elements.

1. `node tools/story.mjs words <file>` prints every word form that needs a translation, plus the probable names.
2. Write the dictionary to the scratchpad as `dict.json`, shaped like `{"form": "перевод", ...}`:
   - One key per printed form, lowercase and exactly as printed. That includes inflected forms (`ran`, `mice`),
     contractions (`don't`, `i'll`) and hyphenated compounds (`half-eaten`).
   - The value is the Russian translation that fits how the word is used in *this* text (`ran` → `побежали`).
     If one form is used in different senses, join them: `"left": "ушла; левый"`.
   - Don't translate articles, prepositions or proper names (people, places, brands); leave them out. The skip list
     in the tool already hides articles and prepositions. Add one of those words only where it works as another
     part of speech that deserves a translation.
   - Possessives (`cat's`) can be left out when the base form (`cat`) is in the dictionary.
3. `node tools/story.mjs build <file> <scratchpad>/dict.json` writes `texts/<slug>.html` and adds or updates the link
   in `index.html`. If it reports `MISSING`, add those forms to the dict and re-run until it prints "No missing words".
   Re-running is safe: the link is updated in place and keeps its date. Options: `--title "…"`, `--slug …`,
   `--lines` (keeps single line breaks, for poems and verse).
4. Commit and push; the site updates a minute or two later:
   ```
   git add texts/<slug>.html index.html
   git commit -m "Add story: <Title>"
   git push
   ```

Don't commit the source text or `dict.json`, because the generated page contains both.
