const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const cities = require('./cities');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Şehir adı -> Diyanet ID ve slug eşlemesi (şimdilik örnek: İstanbul)
// Not: Diyanet sistemi ilçe/district ID + slug kullanıyor. 9541 İstanbul için geçerli genel sayfadır.
// Bilinen şehir mappingleri (manuel eklenen)
const knownCityMappings = {
  istanbul: { id: '9541', slug: 'istanbul-icin-namaz-vakti' },
  bursa: { id: '9335', slug: 'bursa-icin-namaz-vakti' }
};

// Province ID -> District ID dönüşümleri
const provinceToDistrictMap = {
  539: '9541', // İstanbul
  520: '9335', // Bursa
  506: '9206', // Ankara (örnek)
  540: '9152'  // İzmir (örnek)
};

// Şehir adından slug oluştur
function createSlug(cityName) {
  const turkishMap = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'I': 'i', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
  };
  
  return cityName
    .toLowerCase()
    .replace(/[çğıöşüÇĞIİÖŞÜ]/g, char => turkishMap[char] || char)
    .replace(/\s+/g, '-') + '-icin-namaz-vakti';
}

// Otomatik district ID bul
async function findDistrictId(cityName) {
  const lowerCity = cityName.toLowerCase();
  
  // Önce bilinen mappinglere bak
  if (knownCityMappings[lowerCity]) {
    return knownCityMappings[lowerCity];
  }
  
  // Yaygın district ID aralıklarını dene
  const ranges = [
    [9100, 9200], // İzmir bölgesi
    [9200, 9300], // Ankara bölgesi  
    [9300, 9400], // Bursa bölgesi
    [9400, 9500], // Diğer
    [9500, 9600]  // İstanbul bölgesi
  ];
  
  const slug = createSlug(cityName);
  
  for (const [start, end] of ranges) {
    for (let id = start; id < end; id += 10) { // 10'ar 10'ar dene
      try {
        const url = `https://namazvakitleri.diyanet.gov.tr/tr-TR/${id}/${slug}`;
        const response = await axios.get(url, { timeout: 3000 });
        
        if (response.data.includes(`var srSehirAdi = "${cityName.toUpperCase()}"`)) {
          console.log(`✅ ${cityName} için district ID bulundu: ${id}`);
          return { id: id.toString(), slug };
        }
      } catch (err) {
        // Devam et
      }
    }
  }
  
  return null;
}

function buildDiyanetUrl(input) {
  const lowered = (input || '').toLowerCase();
  
  // Sadece rakamsa direkt ID olarak dene
  if (/^\d+$/.test(lowered)) {
    // Province ID -> District ID dönüşümü
    if (provinceToDistrictMap[lowered]) {
      const districtId = provinceToDistrictMap[lowered];
      // Bilinen mappingden slug al
      for (const [city, data] of Object.entries(knownCityMappings)) {
        if (data.id === districtId) {
          return `https://namazvakitleri.diyanet.gov.tr/tr-TR/${data.id}/${data.slug}`;
        }
      }
    }
    return `https://namazvakitleri.diyanet.gov.tr/tr-TR/${lowered}`;
  }
  
  // Harf ise mapping'e bak
  if (knownCityMappings[lowered]) {
    const { id, slug } = knownCityMappings[lowered];
    return `https://namazvakitleri.diyanet.gov.tr/tr-TR/${id}/${slug}`;
  }
  
  return 'AUTO_DETECT'; // Otomatik detection gerekiyor
}

async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await axios.get(url, options);
    } catch (err) {
      lastErr = err;
      const retriable = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code) || (err.message && err.message.includes('timeout')) || (err.message && err.message.includes('socket hang up'));
      if (!retriable || i === retries) break;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Middleware
app.use(cors());
app.use(express.json());

// Ana endpoint - API bilgisi
app.get('/', (req, res) => {
  res.json({
    message: 'Namaz Vakitleri API',
    version: '1.0.0',
    endpoints: {
      '/': 'API bilgisi',
      '/prayer-times/:city': 'Şehir için namaz vakitleri',
      '/cities': 'Mevcut şehirler listesi'
    }
  });
});

// Şehir listesi endpoint'i
app.get('/cities', async (req, res) => {
  try {
    res.json({
      success: true,
      cities: cities
    });
  } catch (error) {
    console.error('Şehir listesi alınırken hata:', error.message);
    res.status(500).json({
      success: false,
      message: 'Şehir listesi alınamadı',
      error: error.message
    });
  }
});

// Namaz vakitleri endpoint'i
app.get('/prayer-times/:city', async (req, res) => {
  const { city } = req.params;
  let targetUrl = buildDiyanetUrl(city);
  
  // Otomatik detection gerekiyorsa
  if (targetUrl === 'AUTO_DETECT') {
    console.log(`🔍 ${city} için otomatik district ID aranıyor...`);
    const detected = await findDistrictId(city);
    
    if (detected) {
      targetUrl = `https://namazvakitleri.diyanet.gov.tr/tr-TR/${detected.id}/${detected.slug}`;
      // Cache'e ekle
      knownCityMappings[city.toLowerCase()] = detected;
      console.log(`✅ ${city} eklendi: ID ${detected.id}`);
    } else {
      return res.status(404).json({
        success: false,
        message: `${city} şehri için namaz vakitleri bulunamadı. Desteklenen: ${Object.keys(knownCityMappings).join(', ')}`
      });
    }
  }

  if (!targetUrl) {
    return res.status(400).json({
      success: false,
      message: 'Desteklenmeyen şehir. Şimdilik: istanbul, bursa veya geçerli numeric ID kullanın.'
    });
  }

  try {
    // Diyanet sitesinden namaz vakitlerini çek
    const response = await fetchWithRetry(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NamazVakitleriAPI/1.0; +https://github.com)'
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);    // JavaScript'ten namaz vakitlerini çıkar
    const scriptContent = $('script').filter((i, elem) => {
      return $(elem).html().includes('var _imsakTime');
    }).html();
    
    const prayerTimes = {};
    let cityName = 'Unknown';
    let date = new Date().toLocaleDateString('tr-TR');
    
    if (scriptContent) {
      // JavaScript değişkenlerinden vakitleri çıkar
      const imsakMatch = scriptContent.match(/var _imsakTime = "([^"]+)"/);
      const gunesMatch = scriptContent.match(/var _gunesTime = "([^"]+)"/);
      const ogleMatch = scriptContent.match(/var _ogleTime = "([^"]+)"/);
      const ikindiMatch = scriptContent.match(/var _ikindiTime = "([^"]+)"/);
      const aksamMatch = scriptContent.match(/var _aksamTime = "([^"]+)"/);
      const yatsiMatch = scriptContent.match(/var _yatsiTime = "([^"]+)"/);
      
      // Şehir adını çıkar
      const cityMatch = scriptContent.match(/var srSehirAdi = "([^"]+)"/);
      if (cityMatch) cityName = cityMatch[1];
      
      if (imsakMatch) prayerTimes.imsak = imsakMatch[1];
      if (gunesMatch) prayerTimes.gunes = gunesMatch[1];
      if (ogleMatch) prayerTimes.ogle = ogleMatch[1];
      if (ikindiMatch) prayerTimes.ikindi = ikindiMatch[1];
      if (aksamMatch) prayerTimes.aksam = aksamMatch[1];
      if (yatsiMatch) prayerTimes.yatsi = yatsiMatch[1];
    }

    // Eğer JavaScript'ten çıkaramazsak HTML'den parse et
    if (Object.keys(prayerTimes).length === 0) {
      $('.tpt-cell').each((index, element) => {
        const title = $(element).find('.tpt-title').text().trim().toLowerCase();
        const time = $(element).find('.tpt-time').text().trim();
        
        if (title && time && time.includes(':')) {
          if (title.includes('imsak')) prayerTimes.imsak = time;
          if (title.includes('güneş')) prayerTimes.gunes = time;
          if (title.includes('öğle')) prayerTimes.ogle = time;
          if (title.includes('ikindi')) prayerTimes.ikindi = time;
          if (title.includes('akşam')) prayerTimes.aksam = time;
          if (title.includes('yatsı')) prayerTimes.yatsi = time;
        }
      });
    }

    // Tarih bilgisini al
    const dateElement = $('.ti-miladi').text().trim();
    if (dateElement) date = dateElement;

    res.json({
      success: true,
      city: cityName,
      date: date,
      prayerTimes: prayerTimes,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Namaz vakitleri alınırken hata:', error.message);
    res.status(500).json({
      success: false,
      message: 'Namaz vakitleri alınamadı',
      error: error.message,
      triedUrl: targetUrl
    });
  }
});

// Belirli bir tarih için namaz vakitleri
app.get('/prayer-times/:city/:date', async (req, res) => {
  const { city, date } = req.params;
  
  try {
    const response = await axios.get(`https://namazvakitleri.diyanet.gov.tr/tr-TR/${city}`);
    const $ = cheerio.load(response.data);
    
    const prayerTimes = {};
    let cityName = 'Unknown';
    
    // JavaScript'ten verileri çıkar
    const scriptContent = $('script').filter((i, elem) => {
      return $(elem).html().includes('var _imsakTime');
    }).html();
    
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

    res.json({
      success: true,
      city: cityName,
      date: date,
      prayerTimes: prayerTimes,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Namaz vakitleri alınırken hata:', error.message);
    res.status(500).json({
      success: false,
      message: 'Namaz vakitleri alınamadı',
      error: error.message
    });
  }
});

// Tüm şehirlerin namaz vakitlerini getir
app.get('/all-prayer-times', async (req, res) => {
  try {
    const allResults = [];
    const cities = require('./cities');
    
    // Ana şehirler için paralel istek (sadece ilk 10 şehir performans için)
    const majorCities = cities.slice(0, 10);
    
    const promises = majorCities.map(async (city) => {
      try {
        const targetUrl = buildDiyanetUrl(city.id);
        if (targetUrl === 'AUTO_DETECT') {
          return null; // Skip auto-detect for bulk request
        }
        
        const response = await fetchWithRetry(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NamazVakitleriAPI/1.0; +https://github.com)'
          },
          timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const scriptContent = $('script').filter((i, elem) => {
          return $(elem).html().includes('var _imsakTime');
        }).html();
        
        const prayerTimes = {};
        let cityName = city.name;
        
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
        
        return {
          id: city.id,
          city: cityName,
          prayerTimes: prayerTimes,
          success: Object.keys(prayerTimes).length > 0
        };
        
      } catch (error) {
        return {
          id: city.id,
          city: city.name,
          success: false,
          error: error.message
        };
      }
    });
    
    const results = await Promise.all(promises);
    const successfulResults = results.filter(r => r && r.success);
    const failedResults = results.filter(r => r && !r.success);
    
    res.json({
      success: true,
      totalCities: majorCities.length,
      successfulCities: successfulResults.length,
      failedCities: failedResults.length,
      date: new Date().toLocaleDateString('tr-TR'),
      cities: successfulResults,
      failures: failedResults,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Toplu namaz vakitleri alınırken hata:', error.message);
    res.status(500).json({
      success: false,
      message: 'Toplu namaz vakitleri alınamadı',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Konum bazlı en yakın şehir bulma
app.get('/prayer-times-by-location', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude (lat) ve longitude (lng) parametreleri gerekli'
      });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    // Türkiye'nin büyük şehirlerinin koordinatları
    const cityCoordinates = {
      'istanbul': { lat: 41.0082, lng: 28.9784 },
      'ankara': { lat: 39.9334, lng: 32.8597 },
      'izmir': { lat: 38.4192, lng: 27.1287 },
      'bursa': { lat: 40.1826, lng: 29.0669 },
      'antalya': { lat: 36.8841, lng: 30.7056 },
      'adana': { lat: 37.0000, lng: 35.3213 },
      'gaziantep': { lat: 37.0662, lng: 37.3833 },
      'konya': { lat: 37.8713, lng: 32.4846 },
      'mersin': { lat: 36.8000, lng: 34.6333 },
      'kayseri': { lat: 38.7312, lng: 35.4787 }
    };
    
    // En yakın şehri bul (Haversine formula)
    let closestCity = 'istanbul';
    let minDistance = Infinity;
    
    for (const [cityName, coords] of Object.entries(cityCoordinates)) {
      const distance = getDistanceFromLatLonInKm(
        latitude, longitude, coords.lat, coords.lng
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestCity = cityName;
      }
    }
    
    // En yakın şehrin namaz vakitlerini getir
    const targetUrl = buildDiyanetUrl(closestCity);
    if (targetUrl === 'AUTO_DETECT') {
      return res.status(404).json({
        success: false,
        message: `${closestCity} için namaz vakitleri bulunamadı`
      });
    }
    
    const response = await fetchWithRetry(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NamazVakitleriAPI/1.0; +https://github.com)'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const scriptContent = $('script').filter((i, elem) => {
      return $(elem).html().includes('var _imsakTime');
    }).html();
    
    const prayerTimes = {};
    let cityName = closestCity.toUpperCase();
    let date = new Date().toLocaleDateString('tr-TR');
    
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
    
    res.json({
      success: true,
      city: cityName,
      closestCity: closestCity,
      distance: Math.round(minDistance),
      coordinates: { lat: latitude, lng: longitude },
      date: date,
      prayerTimes: prayerTimes,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Konum bazlı namaz vakitleri alınırken hata:', error.message);
    res.status(500).json({
      success: false,
      message: 'Konum bazlı namaz vakitleri alınamadı',
      error: error.message
    });
  }
});

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c;
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Sunucu hatası',
    error: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Namaz Vakitleri API ${PORT} portunda çalışıyor`);
  console.log(`📱 Mobil uygulamanız için hazır!`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔄 All prayer times endpoint: /all-prayer-times`);
});

module.exports = app;
