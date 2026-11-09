# Random Questions — Analytics Hub

The central homepage for [randomquestions-projects.github.io](https://randomquestions-projects.github.io/).

A lightweight static website that lists and links to independent analytics apps. It does **not** replace or change either existing project's repository, data feeds, deployment, or GitHub Pages URL.

## Included

- Responsive, minimal single-page design
- Direct links to the College Football Merit Index and Cricket Greatness Lab
- Search across project titles, descriptions, categories, and keywords
- Category filter chips generated automatically from project data
- Accessible controls, keyboard `/` search shortcut, no-results reset, reduced-motion support
- Basic SEO/social metadata; no dependencies, cookies, tracking scripts, or paid services
- Placeholder note for a future Writing area (not an inactive or broken page link)

## Publish at the GitHub Pages root

1. Sign into GitHub as `randomquestions-projects`.
2. Create a new **public** repository named exactly `randomquestions-projects.github.io` (do not select a template or auto-generate files; an empty repository is fine).
3. Add the files from this folder to the **repository root** and commit to the `main` branch.
4. Open **Settings → Pages** in the new repository. Under **Build and deployment**, choose **Deploy from a branch**, `main`, `/ (root)`; save.
5. Open https://randomquestions-projects.github.io/ once GitHub Pages has deployed. This can take a few minutes.

The two existing live apps remain at:
- https://randomquestions-projects.github.io/college-football-merit-index/
- https://randomquestions-projects.github.io/cricket-greatness-index/

## Adding another project

Open `projects.js` and add another object to `window.RQ_PROJECTS`:

```js
{
  id: 'new-project',
  title: 'New Project Name',
  shortName: 'NP',
  domain: 'ANALYTICS CATEGORY',
  description: 'One concise sentence describing what someone can explore.',
  categories: ['Category One', 'Category Two'],
  searchKeywords: ['optional', 'extra search terms'],
  url: 'https://example.com/new-project/',
  theme: 'default'
}
```

The cards, project count, and filter categories update automatically. No build step required. Choose `theme: 'default'` unless you also add a new visual theme in `styles.css`.

## Future writing / blog

When you are ready, add a `/writing/` section in this same repository (Markdown-to-static generation can be introduced later), then turn the disabled **Writing · soon** navigation label into a link. A practical long-term path is to maintain an `articles.js` (or JSON) index with topics/tags and article URLs, reuse the filtering components, and add rendered article detail pages. No CMS is necessary for a small collection.

## Local preview

From the folder containing these files, run:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000/.
