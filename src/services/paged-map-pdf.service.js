'use strict';

const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

const PAGES_PER_BATCH = 2;
let previousJob = Promise.resolve();

function splitHtmlPages(html) {
  const pagePattern = /<section class="page(?: [^"]*)?">[\s\S]*?<\/section>/g;
  const sections = [...html.matchAll(pagePattern)];

  if (!sections.length) {
    throw new Error('El reporte no contiene páginas imprimibles.');
  }

  const first = sections[0];
  const last = sections[sections.length - 1];
  const prefix = html.slice(0, first.index);
  const suffix = html.slice(last.index + last[0].length);
  const pages = sections.map(section => section[0]);

  return { prefix, pages, suffix };
}

async function renderBatch(browser, html) {
  const page = await browser.newPage();

  try {
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);
    await page.emulateMediaType('print');
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all([...document.images].map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }));
    });
    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 120000
    });
  } finally {
    await page.close();
  }
}

async function writePdf(html, output) {
  const { prefix, pages, suffix } = splitHtmlPages(html);
  const document = await PDFDocument.create();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    for (let index = 0; index < pages.length; index += PAGES_PER_BATCH) {
      const batch = pages.slice(index, index + PAGES_PER_BATCH);
      const batchHtml = prefix + batch.join('\n') + suffix;
      const bytes = await renderBatch(browser, batchHtml);
      const source = await PDFDocument.load(bytes);
      const copied = await document.copyPages(source, source.getPageIndices());
      copied.forEach(page => document.addPage(page));
    }

    if (document.getPageCount() !== pages.length) {
      throw new Error(`El reporte esperaba ${pages.length} páginas y generó ${document.getPageCount()}.`);
    }

    fs.writeFileSync(output, await document.save());
  } finally {
    await browser.close();
  }

  return output;
}

exports.writePdf = (html, output) => {
  const job = previousJob.then(() => writePdf(html, output));
  previousJob = job.catch(() => {});
  return job;
};

exports.splitHtmlPages = splitHtmlPages;
