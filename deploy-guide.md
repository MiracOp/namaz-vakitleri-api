# 🚀 API Production Deployment Rehberi

## 1. Heroku ile Deploy

```bash
# Heroku CLI yükle, sonra:
heroku create namaz-vakitleri-api
git add .
git commit -m "Initial commit"
git push heroku main
```

## 2. Environment Variables
```bash
heroku config:set NODE_ENV=production
heroku config:set PORT=443
```

## 3. Domain Ayarlama
```bash
heroku domains:add api.yourapp.com
```

## 4. Mobil App'de Kullanım

### React Native:
```javascript
const API_BASE = 'https://your-app.herokuapp.com';

const getPrayerTimes = async (city) => {
  const response = await fetch(`${API_BASE}/prayer-times/${city}`);
  return await response.json();
};
```

### iOS/Android:
- Base URL: `https://your-app.herokuapp.com`
- Endpoints: `/prayer-times/istanbul`, `/prayer-times/bursa`

## 5. API Endpoints

- `GET /` - API bilgisi
- `GET /cities` - Şehir listesi  
- `GET /prayer-times/:city` - Günlük namaz vakitleri
- `GET /prayer-times/:city/:date` - Belirli tarih (gelecekte)

## 6. Response Format

```json
{
  "success": true,
  "city": "İSTANBUL",
  "date": "1 Eylül Pazartesi", 
  "prayerTimes": {
    "imsak": "04:53",
    "gunes": "06:24", 
    "ogle": "13:09",
    "ikindi": "16:49",
    "aksam": "19:45",
    "yatsi": "21:09"
  },
  "timestamp": "2025-09-01T00:43:51.086Z"
}
```
