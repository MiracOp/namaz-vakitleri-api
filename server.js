const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const cities = require('./cities');
require('dotenv').config();

// Cache sistemi - 30 dakika cache
const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 dakika

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

// Otomatik ülke bazlı namaz vakitleri - IP'den ülke tespit eder
app.get('/prayer-times-global', async (req, res) => {
  try {
    // Kullanıcının IP adresini al
    const userIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                   req.ip;

    let finalIP = userIP;
    if (finalIP && finalIP.includes(',')) {
      finalIP = finalIP.split(',')[0].trim();
    }
    if (finalIP && finalIP.startsWith('::ffff:')) {
      finalIP = finalIP.substring(7);
    }

    console.log('🌍 IP tespit edildi:', finalIP);

    // Varsayılan: İstanbul, Türkiye
    let targetCountry = 'TR';
    let targetCity = 'istanbul';
    let detectionMethod = 'fallback';
    let locationInfo = null;

    // Localhost ve özel IP'ler için geolocation atla
    if (finalIP && 
        finalIP !== '127.0.0.1' && 
        finalIP !== 'localhost' && 
        finalIP !== '::1' &&
        !finalIP.startsWith('192.168.') &&
        !finalIP.startsWith('10.') &&
        !finalIP.startsWith('172.')) {
      
      try {
        // Hızlı IP geolocation
        console.log('🔍 Ülke tespiti başlatılıyor...');
        const geoResponse = await axios.get(`https://ipapi.co/${finalIP}/json/`, {
          timeout: 2000, // Hızlı yanıt için 2 saniye
          headers: {
            'User-Agent': 'Prayer-Times-Global-API/1.0'
          }
        });

        if (geoResponse.data && geoResponse.data.country_code) {
          targetCountry = geoResponse.data.country_code;
          const cityName = geoResponse.data.city;
          
          locationInfo = {
            city: cityName,
            region: geoResponse.data.region,
            country: geoResponse.data.country_name,
            countryCode: targetCountry,
            latitude: geoResponse.data.latitude,
            longitude: geoResponse.data.longitude
          };

          console.log(`🌍 Tespit edilen ülke: ${targetCountry} (${geoResponse.data.country_name})`);

          // Ülkeye göre şehir belirleme
          if (targetCountry === 'TR') {
            // Türkiye - şehir eşleştir
            if (cityName) {
              const normalizedCity = cityName.toLowerCase()
                .replace('i̇', 'i').replace('ş', 's').replace('ç', 'c')
                .replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o');

              const turkishCities = {
                'istanbul': 'istanbul', 'ankara': 'ankara', 'izmir': 'izmir',
                'bursa': 'bursa', 'antalya': 'antalya', 'adana': 'adana',
                'gaziantep': 'gaziantep', 'konya': 'konya', 'mersin': 'mersin'
              };

              targetCity = turkishCities[normalizedCity] || 'istanbul';
            }
            detectionMethod = 'ip_turkey';
          } else {
            // Diğer ülkeler - en yakın büyük şehir
            const countryCapitals = {
              'US': 'new-york',     // Amerika
              'GB': 'london',       // İngiltere  
              'DE': 'berlin',       // Almanya
              'FR': 'paris',        // Fransa
              'NL': 'amsterdam',    // Hollanda
              'BE': 'brussels',     // Belçika
              'AT': 'vienna',       // Avusturya
              'CH': 'zurich',       // İsviçre
              'SA': 'riyadh',       // Suudi Arabistan
              'AE': 'dubai',        // BAE
              'EG': 'cairo',        // Mısır
              'MA': 'casablanca',   // Fas
              'DZ': 'algiers',      // Cezayir
              'TN': 'tunis',        // Tunus
              'LY': 'tripoli',      // Libya
              'JO': 'amman',        // Ürdün
              'LB': 'beirut',       // Lübnan
              'SY': 'damascus',     // Suriye
              'IQ': 'baghdad',      // Irak
              'IR': 'tehran',       // İran
              'PK': 'karachi',      // Pakistan
              'IN': 'delhi',        // Hindistan
              'BD': 'dhaka',        // Bangladeş
              'MY': 'kuala-lumpur', // Malezya
              'ID': 'jakarta'       // Endonezya
            };

            targetCity = countryCapitals[targetCountry] || 'istanbul';
            detectionMethod = targetCountry === 'TR' ? 'ip_turkey' : 'ip_international';
          }
        }
      } catch (geoError) {
        console.log('❌ Geolocation hatası:', geoError.message);
        // İstanbul ile devam
      }
    }

    // Cache kontrolü
    const cacheKey = `global-prayer-${targetCountry}-${targetCity}`;
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        source: 'cache',
        country: targetCountry,
        city: targetCity,
        detection: {
          method: detectionMethod,
          ip: finalIP,
          location: locationInfo
        },
        ...cachedData
      });
    }

    let prayerTimesData;

    if (targetCountry === 'TR') {
      // Türkiye için Diyanet API kullan
      const targetUrl = buildDiyanetUrl(targetCity);
      if (targetUrl === 'AUTO_DETECT') {
        throw new Error(`${targetCity} için URL bulunamadı`);
      }

      const response = await fetchWithRetry(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PrayerTimesGlobalAPI/1.0)'
        },
        timeout: 5000 // Hızlı yanıt
      });
      
      const $ = cheerio.load(response.data);
      const scriptContent = $('script').filter((i, elem) => {
        return $(elem).html().includes('var _imsakTime');
      }).html();
      
      const prayerTimes = {};
      let cityName = targetCity.toUpperCase();
      
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
        if (gunesMatch) prayerTimes.fajr = gunesMatch[1];
        if (ogleMatch) prayerTimes.dhuhr = ogleMatch[1];
        if (ikindiMatch) prayerTimes.asr = ikindiMatch[1];
        if (aksamMatch) prayerTimes.maghrib = aksamMatch[1];
        if (yatsiMatch) prayerTimes.isha = yatsiMatch[1];
      }

      prayerTimesData = {
        city: cityName,
        date: new Date().toLocaleDateString('tr-TR'),
        prayerTimes: prayerTimes,
        source: 'diyanet_turkey'
      };

    } else {
      // Diğer ülkeler için alternatif API veya sabit veriler
      // Bu örnekte İstanbul'a fallback yapıyoruz
      console.log(`🔄 ${targetCountry} için İstanbul fallback kullanılıyor`);
      
      const istanbulUrl = buildDiyanetUrl('istanbul');
      const response = await fetchWithRetry(istanbulUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PrayerTimesGlobalAPI/1.0)'
        },
        timeout: 5000
      });
      
      const $ = cheerio.load(response.data);
      const scriptContent = $('script').filter((i, elem) => {
        return $(elem).html().includes('var _imsakTime');
      }).html();
      
      const prayerTimes = {};
      if (scriptContent) {
        const imsakMatch = scriptContent.match(/var _imsakTime = "([^"]+)"/);
        const gunesMatch = scriptContent.match(/var _gunesTime = "([^"]+)"/);
        const ogleMatch = scriptContent.match(/var _ogleTime = "([^"]+)"/);
        const ikindiMatch = scriptContent.match(/var _ikindiTime = "([^"]+)"/);
        const aksamMatch = scriptContent.match(/var _aksamTime = "([^"]+)"/);
        const yatsiMatch = scriptContent.match(/var _yatsiTime = "([^"]+)"/);
        
        if (imsakMatch) prayerTimes.imsak = imsakMatch[1];
        if (gunesMatch) prayerTimes.fajr = gunesMatch[1];
        if (ogleMatch) prayerTimes.dhuhr = ogleMatch[1];
        if (ikindiMatch) prayerTimes.asr = ikindiMatch[1];
        if (aksamMatch) prayerTimes.maghrib = aksamMatch[1];
        if (yatsiMatch) prayerTimes.isha = yatsiMatch[1];
      }

      prayerTimesData = {
        city: `İstanbul (${locationInfo?.country || targetCountry} için)`,
        date: new Date().toLocaleDateString('tr-TR'),
        prayerTimes: prayerTimes,
        source: 'istanbul_fallback'
      };
    }

    const result = {
      success: true,
      country: targetCountry,
      detection: {
        method: detectionMethod,
        ip: finalIP,
        location: locationInfo
      },
      ...prayerTimesData,
      timestamp: new Date().toISOString()
    };
    
    // 15 dakika cache (uluslararası için daha kısa)
    setCachedData(cacheKey, result);
    
    res.json(result);

  } catch (error) {
    console.error('❌ Global namaz vakitleri hatası:', error.message);
    
    // Son çare: İstanbul cache
    try {
      const fallbackKey = 'global-prayer-TR-istanbul';
      const cachedData = getCachedData(fallbackKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          source: 'emergency_cache',
          country: 'TR',
          city: 'İstanbul',
          detection: {
            method: 'emergency_fallback',
            error: error.message
          },
          ...cachedData
        });
      }

      // Fresh İstanbul
      const istanbulUrl = buildDiyanetUrl('istanbul');
      const response = await fetchWithRetry(istanbulUrl, {
        timeout: 3000
      });
      
      const $ = cheerio.load(response.data);
      const scriptContent = $('script').filter((i, elem) => {
        return $(elem).html().includes('var _imsakTime');
      }).html();
      
      const prayerTimes = {};
      if (scriptContent) {
        const imsakMatch = scriptContent.match(/var _imsakTime = "([^"]+)"/);
        const gunesMatch = scriptContent.match(/var _gunesTime = "([^"]+)"/);
        const ogleMatch = scriptContent.match(/var _ogleTime = "([^"]+)"/);
        const ikindiMatch = scriptContent.match(/var _ikindiTime = "([^"]+)"/);
        const aksamMatch = scriptContent.match(/var _aksamTime = "([^"]+)"/);
        const yatsiMatch = scriptContent.match(/var _yatsiTime = "([^"]+)"/);
        
        if (imsakMatch) prayerTimes.imsak = imsakMatch[1];
        if (gunesMatch) prayerTimes.fajr = gunesMatch[1];
        if (ogleMatch) prayerTimes.dhuhr = ogleMatch[1];
        if (ikindiMatch) prayerTimes.asr = ikindiMatch[1];
        if (aksamMatch) prayerTimes.maghrib = aksamMatch[1];
        if (yatsiMatch) prayerTimes.isha = yatsiMatch[1];
      }
      
      const emergencyResult = {
        success: true,
        country: 'TR',
        city: 'İstanbul',
        date: new Date().toLocaleDateString('tr-TR'),
        prayerTimes: prayerTimes,
        source: 'emergency_fresh',
        detection: {
          method: 'emergency_fallback',
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
      
      setCachedData(fallbackKey, emergencyResult);
      res.json(emergencyResult);
      
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        message: 'Namaz vakitleri servisi geçici olarak kullanılamıyor',
        error: 'Lütfen daha sonra tekrar deneyin'
      });
    }
  }
});

// Otomatik IP bazlı konum tespiti - Kullanıcının IP'sinden şehrini tespit eder
app.get('/prayer-times-auto', async (req, res) => {
  try {
    // Kullanıcının IP adresini al
    const userIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                   req.ip;

    let finalIP = userIP;
    if (finalIP && finalIP.includes(',')) {
      finalIP = finalIP.split(',')[0].trim();
    }
    if (finalIP && finalIP.startsWith('::ffff:')) {
      finalIP = finalIP.substring(7);
    }

    console.log('🔍 Tespit edilen IP:', finalIP);

    // Varsayılan olarak İstanbul
    let targetCity = 'istanbul';
    let detectionMethod = 'fallback';
    let locationInfo = null;

    // Localhost ve özel IP'ler için geolocation yapmayı atla
    if (finalIP && 
        finalIP !== '127.0.0.1' && 
        finalIP !== 'localhost' && 
        finalIP !== '::1' &&
        !finalIP.startsWith('192.168.') &&
        !finalIP.startsWith('10.') &&
        !finalIP.startsWith('172.')) {
      
      try {
        // ipapi.co ile geolocation (ücretsiz: günde 1000 istek)
        console.log('🌍 IP Geolocation başlatılıyor...');
        const geoResponse = await axios.get(`https://ipapi.co/${finalIP}/json/`, {
          timeout: 3000,
          headers: {
            'User-Agent': 'Namaz-Vakitleri-API/1.0'
          }
        });

        if (geoResponse.data && geoResponse.data.country_code === 'TR') {
          const cityName = geoResponse.data.city;
          locationInfo = {
            city: cityName,
            region: geoResponse.data.region,
            country: geoResponse.data.country_name,
            latitude: geoResponse.data.latitude,
            longitude: geoResponse.data.longitude
          };

          console.log('📍 Tespit edilen konum:', locationInfo);

          // Türk şehri eşleştirmeyi dene
          if (cityName) {
            const normalizedCityName = cityName.toLowerCase()
              .replace('i̇', 'i')
              .replace('ş', 's')
              .replace('ç', 'c')
              .replace('ğ', 'g')
              .replace('ü', 'u')
              .replace('ö', 'o');

            // Şehir eşleştirme logic'i
            const cityMappings = {
              'istanbul': 'istanbul',
              'ankara': 'ankara', 
              'izmir': 'izmir',
              'bursa': 'bursa',
              'antalya': 'antalya',
              'adana': 'adana',
              'gaziantep': 'gaziantep',
              'konya': 'konya',
              'mersin': 'mersin',
              'kayseri': 'kayseri'
            };

            if (cityMappings[normalizedCityName]) {
              targetCity = cityMappings[normalizedCityName];
              detectionMethod = 'ip_geolocation';
              console.log(`✅ Şehir eşleşti: ${targetCity}`);
            }
          }
        } else {
          console.log('🌍 Türkiye dışından bağlantı, İstanbul varsayılan');
        }
      } catch (geoError) {
        console.log('❌ Geolocation hatası:', geoError.message);
        // İstanbul ile devam et
      }
    } else {
      console.log('🏠 Yerel IP tespit edildi, İstanbul varsayılan');
    }

    // Cache kontrolü
    const cacheKey = `prayer-times-${targetCity}`;
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        city: targetCity,
        source: 'cache',
        detection: {
          method: detectionMethod,
          ip: finalIP,
          location: locationInfo
        },
        ...cachedData.prayerTimes ? cachedData : { prayerTimes: cachedData }
      });
    }

    // Namaz vakitlerini getir
    const targetUrl = buildDiyanetUrl(targetCity);
    if (targetUrl === 'AUTO_DETECT') {
      throw new Error(`${targetCity} için URL bulunamadı`);
    }

    const response = await fetchWithRetry(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NamazVakitleriAPI/1.0; +https://github.com)'
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(response.data);
    const scriptContent = $('script').filter((i, elem) => {
      return $(elem).html().includes('var _imsakTime');
    }).html();
    
    const prayerTimes = {};
    let cityName = targetCity.toUpperCase();
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

    const result = {
      success: true,
      city: cityName,
      date: date,
      prayerTimes: prayerTimes,
      detection: {
        method: detectionMethod,
        ip: finalIP,
        location: locationInfo
      },
      timestamp: new Date().toISOString()
    };
    
    setCachedData(cacheKey, result);
    
    res.json(result);

  } catch (error) {
    console.error('❌ Otomatik konum namaz vakitleri hatası:', error.message);
    
    // Son çare: İstanbul'dan cache'li veri
    try {
      const cacheKey = 'prayer-times-istanbul';
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          city: 'İstanbul',
          source: 'cache_fallback',
          detection: {
            method: 'error_fallback',
            error: error.message
          },
          ...cachedData.prayerTimes ? cachedData : { prayerTimes: cachedData }
        });
      }

      // Fresh İstanbul verisi
      const targetUrl = buildDiyanetUrl('istanbul');
      const response = await fetchWithRetry(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NamazVakitleriAPI/1.0; +https://github.com)'
        },
        timeout: 8000
      });
      
      const $ = cheerio.load(response.data);
      const scriptContent = $('script').filter((i, elem) => {
        return $(elem).html().includes('var _imsakTime');
      }).html();
      
      const prayerTimes = {};
      if (scriptContent) {
        const imsakMatch = scriptContent.match(/var _imsakTime = "([^"]+)"/);
        const gunesMatch = scriptContent.match(/var _gunesTime = "([^"]+)"/);
        const ogleMatch = scriptContent.match(/var _ogleTime = "([^"]+)"/);
        const ikindiMatch = scriptContent.match(/var _ikindiTime = "([^"]+)"/);
        const aksamMatch = scriptContent.match(/var _aksamTime = "([^"]+)"/);
        const yatsiMatch = scriptContent.match(/var _yatsiTime = "([^"]+)"/);
        
        if (imsakMatch) prayerTimes.imsak = imsakMatch[1];
        if (gunesMatch) prayerTimes.gunes = gunesMatch[1];
        if (ogleMatch) prayerTimes.ogle = ogleMatch[1];
        if (ikindiMatch) prayerTimes.ikindi = ikindiMatch[1];
        if (aksamMatch) prayerTimes.aksam = aksamMatch[1];
        if (yatsiMatch) prayerTimes.yatsi = yatsiMatch[1];
      }
      
      const fallbackResult = {
        success: true,
        city: 'İstanbul',
        date: new Date().toLocaleDateString('tr-TR'),
        prayerTimes: prayerTimes,
        detection: {
          method: 'error_fallback',
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
      
      setCachedData(cacheKey, fallbackResult);
      res.json(fallbackResult);
      
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        message: 'Namaz vakitleri servisi geçici olarak kullanılamıyor',
        error: 'Tekrar deneyin'
      });
    }
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı'
  });
});

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
  const city = req.params.city.toLowerCase();
  
  // Cache kontrolü
  const cacheKey = `prayer-times-${city}`;
  const cachedResult = getCachedData(cacheKey);
  if (cachedResult) {
    return res.json(cachedResult);
  }

  let targetUrl;
  
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
      timeout: 8000
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

    const result = {
      success: true,
      city: cityName,
      date: date,
      prayerTimes: prayerTimes,
      timestamp: new Date().toISOString()
    };

    // Cache'e kaydet
    setCachedData(cacheKey, result);
    
    res.json(result);
    
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
