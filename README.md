# Namaz Vakitleri API 🕌

Diyanet İşleri Başkanlığı'nın resmi sitesinden namaz vakitlerini çeken RESTful API.

## Özellikler ✨

- 🌍 Tüm Türkiye şehirleri için namaz vakitleri
- 📅 Günlük ve tarihsel veri desteği  
- 📱 Mobil uygulama entegrasyonu için optimize
- 🚀 Hızlı ve güvenilir
- 🔄 Real-time veri çekme

## Kurulum 🔧

```bash
# Repoyu klonla
git clone <repo-url>
cd namaz-vakitleri-api

# Bağımlılıkları yükle
npm install

# Geliştirme modunda çalıştır
npm run dev

# Veya production modunda
npm start
```

## API Endpoints 📡

### 1. Ana Bilgi
```
GET /
```
API hakkında genel bilgi döndürür.

### 2. Şehir Listesi
```
GET /cities
```
Mevcut tüm şehirleri ve ID'lerini döndürür.

**Örnek Response:**
```json
{
  "success": true,
  "cities": [
    {"id": "9146", "name": "İstanbul"},
    {"id": "9559", "name": "Ankara"},
    {"id": "9152", "name": "İzmir"}
  ]
}
```

### 3. Günlük Namaz Vakitleri
```
GET /prayer-times/:city
```

**Örnek:**
```
GET /prayer-times/9146
```

**Response:**
```json
{
  "success": true,
  "city": "İstanbul",
  "date": "01.09.2025",
  "prayerTimes": {
    "imsak": "04:52",
    "güneş": "06:24", 
    "öğle": "13:01",
    "ikindi": "16:45",
    "akşam": "19:29",
    "yatsı": "20:58"
  },
  "timestamp": "2025-09-01T10:30:00.000Z"
}
```

### 4. Belirli Tarih İçin Namaz Vakitleri
```
GET /prayer-times/:city/:date
```

**Örnek:**
```
GET /prayer-times/9146/2025-09-15
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
