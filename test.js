const axios = require('axios');

const testAPI = async () => {
  try {
    console.log('🔄 API test ediliyor...\n');
    
    // 1. Ana endpoint test
    console.log('1️⃣ Ana endpoint test:');
    const response1 = await axios.get('http://localhost:3001/');
    console.log(JSON.stringify(response1.data, null, 2));
    console.log('✅ Ana endpoint başarılı!\n');
    
    // 2. Şehir listesi test
    console.log('2️⃣ Şehir listesi test:');
    const response2 = await axios.get('http://localhost:3001/cities');
    console.log(`📍 ${response2.data.cities.length} şehir bulundu`);
    console.log('İlk 5 şehir:', response2.data.cities.slice(0, 5));
    console.log('✅ Şehir listesi başarılı!\n');
    
    // 3. İstanbul namaz vakitleri test (şehir ID'si 539)
    console.log('3️⃣ İstanbul namaz vakitleri test:');
    const istanbulId = '539';
    
    console.log(`🕌 İstanbul ID: ${istanbulId}`);
    const response3 = await axios.get(`http://localhost:3001/prayer-times/${istanbulId}`);
    console.log(JSON.stringify(response3.data, null, 2));
    console.log('✅ Namaz vakitleri başarılı!\n');
    
    // 4. Ankara test (şehir ID'si 506)
    console.log('4️⃣ Ankara namaz vakitleri test:');
    const ankaraId = '506';
    
    console.log(`🕌 Ankara ID: ${ankaraId}`);
    const response4 = await axios.get(`http://localhost:3001/prayer-times/${ankaraId}`);
    console.log(JSON.stringify(response4.data, null, 2));
    console.log('✅ Ankara namaz vakitleri başarılı!\n');
    
    console.log('🎉 Tüm testler başarıyla tamamlandı!');
    console.log('📱 Mobil uygulamanızda kullanabilirsiniz!');
    
  } catch (error) {
    console.error('❌ Test hatası:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
};

// API'nin başlaması için 2 saniye bekle
setTimeout(testAPI, 2000);
