import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');
const base = 'https://ehsan-tvet.vercel.app';
const catalogue = JSON.parse(await read('content.json'));
const pages = ['/', '/banding-program', ...catalogue.courses.map(course => '/program/' + course.id)];

test('public sitemap and canonical links agree with the published catalogue', async () => {
  const sitemap = await read('sitemap.xml');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(locations.sort(), pages.map(path => base + path).sort());
  const titles = new Set();
  for (const path of pages) {
    const html = await read(path === '/' ? 'index.html' : path.slice(1) + '.html');
    const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
    assert.deepEqual(canonical.map(match => match[1]), [base + path], path);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, path);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && !titles.has(title), path);
    titles.add(title);
    for (const course of catalogue.courses) {
      if (path !== '/program/' + course.id) assert.ok(html.includes('href="/program/' + course.id + '"'), path);
    }
    assert.doesNotMatch(html, /href="\/program\/[^"]*\.html"/);
  }
});

test('visible questions and answers match the structured FAQ', async () => {
  const home = await read('index.html');
  const graph = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const faq = graph.find(item => item['@type'] === 'FAQPage').mainEntity;
  const escapeText = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  assert.equal(faq.length, catalogue.site.faq.items.length);
  for (const [index, question] of faq.entries()) {
    assert.ok(home.includes(`<summary data-t="site.faq.items.${index}.q">${escapeText(question.name)}</summary>`));
    assert.ok(home.includes(`<p data-t="site.faq.items.${index}.a">${escapeText(question.acceptedAnswer.text)}</p>`));
  }
});
