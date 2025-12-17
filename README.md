# 🕌 Namaz Vakitleri API# Namaz Vakitleri API 🕌



Diyanet İşleri Başkanlığı verilerini kullanarak namaz vakitlerini sağlayan RESTful API.Diyanet İşleri Başkanlığı'nın resmi sitesinden namaz vakitlerini çeken RESTful API.



## 🚀 Hızlı Başlangıç## Özellikler ✨



```bash- 🌍 Tüm Türkiye şehirleri için namaz vakitleri

# Dependencies yükle- 📅 Günlük ve tarihsel veri desteği  

npm install- 📱 Mobil uygulama entegrasyonu için optimize

- 🚀 Hızlı ve güvenilir

# API'yi başlat- 🔄 Real-time veri çekme

npm start

## Kurulum 🔧

# API çalışır: http://localhost:3001

``````bash

# Repoyu klonla

## 📋 Özelliklergit clone <repo-url>

cd namaz-vakitleri-api

- ✅ **İstanbul namaz vakitleri** - Güncel ve doğru veriler

- ✅ **Şehir desteği** - İstanbul, Ankara, İzmir# Bağımlılıkları yükle

- ✅ **Cache sistemi** - 30 dakika cache ile hızlı yanıtnpm install

- ✅ **RESTful API** - Kolay entegrasyon

- ✅ **CORS destekli** - Frontend uygulamalarla çalışır# Geliştirme modunda çalıştır

npm run dev

## 🔗 API Endpoints

# Veya production modunda

### 📍 İstanbul Namaz Vakitlerinpm start

```bash```

GET /prayer-times/istanbul

```## API Endpoints 📡



**Örnek Yanıt:**### 1. Ana Bilgi

```json```

{GET /

  "success": true,```

  "city": "İSTANBUL",API hakkında genel bilgi döndürür.

  "date": "6 Kasım 2025 Perşembe",

  "prayerTimes": {### 2. Şehir Listesi

    "imsak": "06:07",```

    "gunes": "07:34",GET /cities

    "ogle": "12:53",```

    "ikindi": "15:36",Mevcut tüm şehirleri ve ID'lerini döndürür.

    "aksam": "18:02",

    "yatsi": "19:23"**Örnek Response:**

  },```json

  "source": "diyanet_html",{

  "timestamp": "2025-11-06T13:33:15.000Z"  "success": true,

}  "cities": [

```    {"id": "9146", "name": "İstanbul"},

    {"id": "9559", "name": "Ankara"},

### 🏙️ Şehir Listesi    {"id": "9152", "name": "İzmir"}

```bash  ]

GET /cities}

``````



### ❤️ Sağlık Kontrolü### 3. Günlük Namaz Vakitleri

```bash```

GET /healthGET /prayer-times/:city

``````



## 💻 Kullanım Örnekleri**Örnek:**

```

### JavaScriptGET /prayer-times/9146

```javascript```

fetch('http://localhost:3001/prayer-times/istanbul')

  .then(res => res.json())**Response:**

  .then(data => console.log(data.prayerTimes));```json

```{

  "success": true,

### Python  "city": "İstanbul",

```python  "date": "01.09.2025",

import requests  "prayerTimes": {

data = requests.get('http://localhost:3001/prayer-times/istanbul').json()    "imsak": "04:52",

print(f"İmsak: {data['prayerTimes']['imsak']}")    "güneş": "06:24", 

```    "öğle": "13:01",

    "ikindi": "16:45",

## 🛠️ Teknolojiler    "akşam": "19:29",

    "yatsı": "20:58"

- Node.js + Express.js  },

- Axios + Cheerio  "timestamp": "2025-09-01T10:30:00.000Z"

- CORS support}

```

## 📝 Notlar

### 4. Belirli Tarih İçin Namaz Vakitleri

- Diyanet İşleri Başkanlığı resmi verileri```

- 30 dakika cacheGET /prayer-times/:city/:date

- Türkiye saati (UTC+3)```



---**Örnek:**

```

**Made with ❤️**GET /prayer-times/9146/2025-09-15

```

## Mobil Uygulama Entegrasyonu 📱

Bu API mobil uygulamanızda şu şekilde kullanabilirsiniz:

### JavaScript/React Native Örneği:
```javascript
// Şehir listesini al
const getCities = async () => {
  const response = await fetch('http://localhost:3000/cities');
  const data = await response.json();
  return data.cities;
};

// İstanbul için namaz vakitlerini al
const getPrayerTimes = async (cityId) => {
  const response = await fetch(`http://localhost:3000/prayer-times/${cityId}`);
  const data = await response.json();
  return data.prayerTimes;
};
```

### Swift/iOS Örneği:
```swift
// Namaz vakitlerini al
func getPrayerTimes(cityId: String, completion: @escaping (PrayerTimes?) -> Void) {
    let url = URL(string: "http://localhost:3000/prayer-times/\(cityId)")!
    URLSession.shared.dataTask(with: url) { data, response, error in
        // Response handling
    }.resume()
}
```

## Environment Variables 🔧

`.env` dosyası oluşturup şu değişkenleri ekleyebilirsiniz:

```env
PORT=3000
NODE_ENV=development
```

## Kullanılan Teknolojiler 🛠️

- **Node.js** - Runtime environment
- **Express.js** - Web framework  
- **Axios** - HTTP client
- **Cheerio** - HTML parsing
- **CORS** - Cross-origin support

## Geliştirme 👨‍💻

```bash
# Dependencies yükle
npm install

# Dev modunda çalıştır (auto-reload)
npm run dev

# Production build
npm start
```

## API Limitleri ⚠️

- Rate limiting uygulanmamıştır
- Diyanet sitesinin yükünü artırmamak için cache kullanmanız önerilir
- Production'da reverse proxy ve load balancer kullanın

## Hata Yönetimi 🚨

API standart HTTP status kodları kullanır:
- `200` - Başarılı
- `404` - Endpoint bulunamadı  
- `500` - Sunucu hatası

## Lisans 📄

MIT License

## Katkıda Bulunma 🤝

1. Fork et
2. Feature branch oluştur (`git checkout -b feature/amazing-feature`)
3. Commit et (`git commit -m 'Add amazing feature'`)
4. Push et (`git push origin feature/amazing-feature`)
5. Pull Request oluştur

---

**Not:** Bu API Diyanet İşleri Başkanlığı'nın resmi API'si değildir. Web scraping yöntemi ile veri çekmektedir.
