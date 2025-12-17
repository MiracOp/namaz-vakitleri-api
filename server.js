const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const cities = require('./cities');
const districts = require('./districts');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Cache sistemi - 30 dakika
const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000;

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Helper: Sabah.com.tr HTML'den namaz vakitlerini parse et
function parsePrayerTimesSabah(html) {
  const $ = cheerio.load(html);
  
  const prayerTimes = {};
  
  // Şehir adını h1'den al
  let cityName = $('.captionWidget').text().trim().replace(' Namaz Vakitleri', '');
  if (!cityName) cityName = 'Bilinmiyor';
  
  // Sabah.com.tr'nin HTML yapısından vakitleri çek
  $('.vakitler ul li').each((index, element) => {
    const label = $(element).find('strong').text().trim();
    const time = $(element).find('span').text().trim();
    
    if (label && time) {
      // Türkçe karakterleri normalize et
      const labelLower = label.toLowerCase()
        .replace('i̇', 'i')
        .replace('ı', 'i');
      
      if (labelLower.includes('imsak')) prayerTimes.imsak = time;
      else if (labelLower.includes('gunes') || labelLower.includes('güneş')) prayerTimes.gunes = time;
      else if (labelLower.includes('ogle') || labelLower.includes('öğle')) prayerTimes.ogle = time;
      else if (labelLower.includes('ikindi')) prayerTimes.ikindi = time;
      else if (labelLower.includes('aksam') || labelLower.includes('akşam')) prayerTimes.aksam = time;
      else if (labelLower.includes('yatsi') || labelLower.includes('yatsı')) prayerTimes.yatsi = time;
    }
  });
  
  return { cityName, prayerTimes };
}

// Helper: Diyanet HTML'den namaz vakitlerini parse et (fallback)
function parsePrayerTimes(html) {
  const $ = cheerio.load(html);
  
  const scriptContent = $('script').filter((i, elem) => {
    return $(elem).html().includes('var _imsakTime');
  }).html();
  
  const prayerTimes = {};
  let cityName = 'Bilinmiyor';
  
  if (scriptContent) {
    const imsakMatch = scriptContent.match(/var _imsakTime = "([^"]+)"/);
    const gunesMatch = scriptContent.match(/var _gunesTime = "([^"]+)"/);
    const ogleMatch = scriptContent.match(/var _ogleTime = "([^"]+)"/);
    const ikindiMatch = scriptContent.match(/var _ikindiTime = "([^"]+)"/);
    const aksamMatch = scriptContent.match(/var _aksamTime = "([^"]+)"/);
    const yatsiMatch = scriptContent.match(/var _yatsiTime = "([^"]+)"/);
    const cityMatch = scriptContent.match(/var srSehirAdi = "([^"]+)"/);
    
    if (cityMatch) cityName = cityMatch[1];
    if (imsakMatch) prayerTimes.imsak = imsakMatch[1];
    if (gunesMatch) prayerTimes.gunes = gunesMatch[1];
    if (ogleMatch) prayerTimes.ogle = ogleMatch[1];
    if (ikindiMatch) prayerTimes.ikindi = ikindiMatch[1];
    if (aksamMatch) prayerTimes.aksam = aksamMatch[1];
    if (yatsiMatch) prayerTimes.yatsi = yatsiMatch[1];
  }
  
  return { cityName, prayerTimes };
}

// Helper: Retry mekanizması
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await axios.get(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          ...options.headers
        },
        timeout: 8000
      });
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: '🕌 Namaz Vakitleri API',
    version: '2.0.0',
    endpoints: {
      '/prayer-times/:city': 'Şehir namaz vakitleri (81 il destekleniyor)',
      '/cities': 'Tüm illerin listesi',
      '/health': 'Sağlık kontrolü'
    },
    examples: [
      '/prayer-times/istanbul',
      '/prayer-times/ankara',
      '/prayer-times/izmir',
      '/prayer-times/antalya'
    ],
    totalCities: districts.length
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.get('/cities', (req, res) => {
  res.json({
    success: true,
    count: districts.length,
    cities: districts.sort(),
    note: 'Tüm 81 il için namaz vakitleri mevcut'
  });
});

app.get('/prayer-times/istanbul', async (req, res) => {
  try {
    const cached = getCachedData('istanbul');
    if (cached) {
      return res.json({ ...cached, source: 'cache' });
    }

    // Sabah.com.tr'den veri çek (daha güvenilir ve bot koruması yok)
    const url = 'https://www.sabah.com.tr/istanbul-namaz-vakitleri';
    const response = await fetchWithRetry(url);
    const { cityName, prayerTimes } = parsePrayerTimesSabah(response.data);
    
    const result = {
      success: true,
      city: cityName,
      date: new Date().toLocaleDateString('tr-TR'),
      prayerTimes,
      source: 'sabah.com.tr',
      timestamp: new Date().toISOString()
    };
    
    setCachedData('istanbul', result);
    res.json(result);
    
  } catch (error) {
    console.error('Sabah.com.tr hatası:', error.message);
    res.status(500).json({
      success: false,
      message: 'Namaz vakitleri alınamadı',
      error: error.message
    });
  }
});

app.get('/prayer-times/:city', async (req, res) => {
  const city = req.params.city.toLowerCase().trim();
  
  // İl kontrolü
  if (!districts.includes(city)) {
    return res.status(404).json({
      success: false,
      message: 'Bu il desteklenmiyor',
      requestedCity: city,
      hint: 'Desteklenen illeri görmek için /cities endpoint\'ini kullanın'
    });
  }
  
  try {
    const cached = getCachedData(city);
    if (cached) {
      return res.json({ ...cached, source: 'cache' });
    }

    // Sabah.com.tr URL formatı: şehir-adı-namaz-vakitleri
    const url = `https://www.sabah.com.tr/${city}-namaz-vakitleri`;
    const response = await fetchWithRetry(url);
    const { cityName, prayerTimes } = parsePrayerTimesSabah(response.data);
    
    // Eğer şehir bulunamadıysa (boş sonuç)
    if (!prayerTimes || Object.keys(prayerTimes).length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bu şehir için namaz vakti bulunamadı',
        city: city
      });
    }
    
    const result = {
      success: true,
      city: cityName,
      date: new Date().toLocaleDateString('tr-TR'),
      prayerTimes,
      source: 'sabah.com.tr',
      timestamp: new Date().toISOString()
    };
    
    setCachedData(city, result);
    res.json(result);
    
  } catch (error) {
    console.error(`${city} şehri için hata:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Namaz vakitleri alınamadı',
      city: city,
      error: error.message
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı'
  });
});

app.listen(PORT, () => {
  console.log(`\n🕌 Namaz Vakitleri API`);
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`✅ http://localhost:${PORT}/prayer-times/istanbul\n`);
});

module.exports = app;
