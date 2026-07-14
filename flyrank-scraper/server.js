require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
  REPLACE THESE WITH YOUR ACTUAL PRACTICE SITE VALUES
*/
const BASE_URL = 'https://books.toscrape.com';
const LISTING_PATH = '/catalogue/page-1.html';

const USER_AGENT =
  `${process.env.SCRAPER_NAME || 'FlyRankPracticeScraper'} ` +
  `(${process.env.SCRAPER_EMAIL || 'your-email@example.com'}) educational bot`;

const DELAY_MS = Number(process.env.SCRAPER_DELAY_MS || 1500);
const OUTPUT_DIR = path.join(__dirname, 'output');
const JSON_PATH = path.join(OUTPUT_DIR, 'records.json');
const CSV_PATH = path.join(OUTPUT_DIR, 'records.csv');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(value) {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function cleanPrice(value) {
  if (!value) return null;
  const numeric = value.replace(/[^0-9.]/g, '');
  return numeric ? Number(numeric) : null;
}

function cleanAvailability(value) {
  const text = cleanText(value).toLowerCase();
  if (text.includes('in stock')) return 'in stock';
  if (text.includes('out of stock')) return 'out of stock';
  return text;
}

function toAbsoluteUrl(relativeOrAbsoluteUrl) {
  if (!relativeOrAbsoluteUrl) return null;
  return new URL(relativeOrAbsoluteUrl, BASE_URL).href;
}

async function fetchPage(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml'
    },
    timeout: 10000
  });
  return response.data;
}

async function fetchWithDelay(url) {
  await sleep(DELAY_MS);
  return fetchPage(url);
}

function saveJson(records) {
  fs.writeFileSync(JSON_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

function saveCsv(records) {
  if (!records.length) {
    fs.writeFileSync(CSV_PATH, '', 'utf-8');
    return;
  }

  const headers = Object.keys(records[0]);

  const rows = records.map(record =>
    headers
      .map(header => {
        const value = record[header] ?? '';
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(CSV_PATH, csv, 'utf-8');
}

async function fetchRobotsTxt() {
  const robotsUrl = `${BASE_URL}/robots.txt`;
  return fetchPage(robotsUrl);
}

async function scrapeListingPage(listingUrl) {
  const html = await fetchWithDelay(listingUrl);
  const $ = cheerio.load(html);

  const detailUrls = [];

  $('article.product_pod').each((index, element) => {
    const relativeUrl = $(element).find('h3 a').attr('href');
    const absoluteUrl = toAbsoluteUrl(`/catalogue/${relativeUrl.replace('../../../', '')}`);

    if (absoluteUrl) {
      detailUrls.push(absoluteUrl);
    }
  });

  return detailUrls;
}

async function scrapeDetailPage(url) {
  const html = await fetchWithDelay(url);
  const $ = cheerio.load(html);

  const title = cleanText($('div.product_main h1').first().text());
  const price = cleanPrice($('p.price_color').first().text());
  const availability = cleanAvailability($('p.availability').first().text());
  const description = cleanText($('#product_description').next('p').text());
  const category = cleanText($('ul.breadcrumb li').eq(2).text());
  const ratingClass = $('p.star-rating').attr('class') || '';

  let rating = '';
  if (ratingClass.includes('One')) rating = 'One';
  else if (ratingClass.includes('Two')) rating = 'Two';
  else if (ratingClass.includes('Three')) rating = 'Three';
  else if (ratingClass.includes('Four')) rating = 'Four';
  else if (ratingClass.includes('Five')) rating = 'Five';

  return {
    title,
    price,
    availability,
    description,
    category,
    rating,
    url
  };
}

async function runScraper() {
  const listingUrl = `${BASE_URL}${LISTING_PATH}`;
  const detailUrls = await scrapeListingPage(listingUrl);

  const results = [];

  for (const url of detailUrls) {
    const record = await scrapeDetailPage(url);
    results.push(record);
  }

  saveJson(results);
  saveCsv(results);

  return results;
}

app.get('/', (req, res) => {
  res.json({
    name: 'Practice Site Scraper',
    status: 'ok',
    baseUrl: BASE_URL,
    endpoints: [
      '/robots-check',
      '/scrape-list',
      '/scrape-one',
      '/run-scraper',
      '/records/json',
      '/records/csv'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/robots-check', async (req, res) => {
  try {
    const robotsText = await fetchRobotsTxt();
    res.type('text/plain').send(robotsText);
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch robots.txt' });
  }
});

app.get('/scrape-list', async (req, res) => {
  try {
    const listingUrl = `${BASE_URL}${LISTING_PATH}`;
    const detailUrls = await scrapeListingPage(listingUrl);

    res.json({
      count: detailUrls.length,
      urls: detailUrls
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/scrape-one', async (req, res) => {
  try {
    const sampleUrl = `${BASE_URL}/catalogue/a-light-in-the-attic_1000/index.html`;
    const record = await scrapeDetailPage(sampleUrl);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/run-scraper', async (req, res) => {
  try {
    const results = await runScraper();

    res.json({
      message: 'Scrape complete',
      records: results.length,
      files: {
        json: 'output/records.json',
        csv: 'output/records.csv'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/records/json', (req, res) => {
  try {
    if (!fs.existsSync(JSON_PATH)) {
      return res.status(404).json({ error: 'records.json not found. Run /run-scraper first.' });
    }

    const data = fs.readFileSync(JSON_PATH, 'utf-8');
    res.type('application/json').send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/records/csv', (req, res) => {
  try {
    if (!fs.existsSync(CSV_PATH)) {
      return res.status(404).json({ error: 'records.csv not found. Run /run-scraper first.' });
    }

    const data = fs.readFileSync(CSV_PATH, 'utf-8');
    res.type('text/csv').send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});