# Yeşil Deniz Taşımacılığında Yapay Zeka Destekli Rota Optimizasyonu

**Yüksek Lisans Araştırma Projesi**

Bu proje, deniz taşımacılığında karbon emisyonlarını azaltmak ve operasyonel verimliliği artırmak amacıyla yapay zeka algoritmalarını (A* ve Genetik Algoritma) kullanarak gemi rotalarını optimize eden kapsamlı bir akademik çalışmadır.

## Proje Özeti

Denizcilik sektörü, küresel ticaret hacminin yaklaşık %90'ını taşırken, küresel sera gazı emisyonlarının %2.5-3'ünden sorumludur. Uluslararası Denizcilik Örgütü (IMO), 2050 yılına kadar net sıfır emisyon hedefine ulaşmayı taahhüt etmiştir. Bu proje, bu hedefe katkıda bulunmak için:

- **A* Algoritması** ile deterministik rota optimizasyonu
- **Genetik Algoritma** ile çok amaçlı evrimsel optimizasyon
- **Gerçek zamanlı hava durumu verileri** (NOAA GFS, Open-Meteo Marine API)
- **Holtrop & Mennen yöntemi** ile fizik tabanlı gemi performans modelleme
- **CII (Carbon Intensity Indicator)** hesaplaması ve IMO uyumluluğu
- **Digital Twin** (Sanal Gemi) konsepti ile dinamik simülasyon

sağlamaktadır.

## Özellikler

### 🚢 Gemi Yönetimi
- Gemi filosu oluşturma ve yönetme
- DWT, hız, yakıt tipi, tüketim oranı gibi detaylı parametreler
- Farklı yakıt tipleri desteği (HFO, LFO, MGO, LNG, Methanol)

### 🗺️ Rota Optimizasyonu
- **A* Algoritması**: Grid tabanlı, heuristik destekli optimal rota bulma
- **Genetik Algoritma**: Popülasyon tabanlı, evrimsel optimizasyon
- Başlangıç ve varış noktaları arasında minimum yakıt tüketimi
- Hava durumu koşullarını dikkate alan dinamik planlama
- Sığ su ve kara kütlelerinden kaçınma

### 🌊 Hava Durumu Entegrasyonu
- NOAA GFS (Global Forecast System) atmosferik veriler
- Open-Meteo Marine API ile dalga ve akıntı verileri
- Rüzgar hızı ve yönü
- Dalga yüksekliği, periyodu ve yönü
- Okyanus akıntıları

### 📊 Performans Analizi
- Yakıt tüketimi hesaplama (ton)
- CO₂ emisyon hesaplama (IMO standartları)
- CII skoru ve derecelendirme (A-E)
- Toplam mesafe (deniz mili)
- Tahmini varış süresi

### 🎯 Karşılaştırmalı Analiz
- A* vs Genetik Algoritma
- Optimize edilmiş rota vs Great Circle (en kısa mesafe)
- Farklı yakıt tipleri için emisyon karşılaştırması

## Teknoloji Yığını

### Backend
- **Node.js** + **TypeScript**
- **tRPC** - Type-safe API
- **Drizzle ORM** - Database management
- **MySQL/TiDB** - Relational database
- **Express** - HTTP server

### Frontend
- **React 19** + **TypeScript**
- **Tailwind CSS 4** - Styling
- **shadcn/ui** - UI components
- **Google Maps API** - Map visualization
- **Wouter** - Routing

### Algoritmalar ve Modeller
- **A* (A-Star)** - Pathfinding algorithm
- **Genetik Algoritma** - Evolutionary optimization
- **Holtrop & Mennen** - Ship resistance calculation
- **ISO 15016:2015** - Weather resistance modeling

### Veri Kaynakları
- **NOAA GFS** - Global weather forecasts
- **Open-Meteo** - Marine weather data
- **GEBCO** - Bathymetry data (simulated)

## Kurulum ve Çalıştırma

### Gereksinimler
- Node.js 22+
- pnpm 10+
- MySQL veya TiDB database

### Kurulum

```bash
# Bağımlılıkları yükle
pnpm install

# Veritabanı migrasyonlarını çalıştır
pnpm db:push

# Development server'ı başlat
pnpm dev

# Testleri çalıştır
pnpm test
```

### Environment Variables

Proje, Manus platformu üzerinde çalıştığı için aşağıdaki environment variable'lar otomatik olarak enjekte edilir:

- `DATABASE_URL` - MySQL/TiDB connection string
- `JWT_SECRET` - Session secret
- `VITE_APP_TITLE` - Application title
- `OAUTH_SERVER_URL` - OAuth server URL

## Proje Yapısı

```
green_shipping_optimization/
├── client/                      # Frontend React uygulaması
│   ├── src/
│   │   ├── pages/              # Sayfa bileşenleri
│   │   │   ├── RouteOptimization.tsx  # Ana optimizasyon arayüzü
│   │   │   └── Vessels.tsx            # Gemi yönetimi
│   │   ├── components/         # Yeniden kullanılabilir bileşenler
│   │   └── lib/                # Utility fonksiyonlar
├── server/                      # Backend API
│   ├── routers.ts              # tRPC API endpoints
│   ├── db.ts                   # Database queries
│   ├── astar-algorithm.ts      # A* implementasyonu
│   ├── genetic-algorithm.ts    # Genetik Algoritma
│   ├── vessel-performance.ts   # Gemi performans modeli
│   ├── weather.ts              # Hava durumu servisleri
│   └── *.test.ts               # Unit testler
├── drizzle/                     # Database schema
│   └── schema.ts               # Tablo tanımlamaları
└── README.md                    # Bu dosya
```

## Kullanım

### 1. Gemi Ekleme
1. "Gemiler" sayfasına gidin
2. "Yeni Gemi Ekle" butonuna tıklayın
3. Gemi bilgilerini girin (ad, tip, DWT, hız, yakıt tipi vb.)
4. Kaydedin

### 2. Rota Optimizasyonu
1. Ana sayfada bir gemi seçin
2. Başlangıç noktasını girin (enlem, boylam)
3. Varış noktasını girin (enlem, boylam)
4. Algoritma seçin (A* veya Genetik)
5. "Rotayı Optimize Et" butonuna tıklayın
6. Sonuçları harita üzerinde ve tablo olarak görüntüleyin

### 3. Sonuçları Analiz Etme
- Toplam mesafe (deniz mili)
- Yakıt tüketimi (ton)
- CO₂ emisyonu (ton)
- Tahmini süre (saat)
- CII skoru

## Algoritmalar

### A* Algoritması

A* algoritması, başlangıç ve hedef noktalar arasında en düşük maliyetli rotayı bulmak için kullanılır. Maliyet fonksiyonu:

```
f(n) = g(n) + h(n)
```

- **g(n)**: Başlangıçtan n noktasına kadar olan gerçek maliyet (yakıt tüketimi)
- **h(n)**: n noktasından hedefe tahmini maliyet (Great Circle mesafesi)

**Özellikler:**
- Grid tabanlı arama (0.5° çözünürlük)
- 8 yönlü hareket (N, NE, E, SE, S, SW, W, NW)
- Sığ su ve kara kontrolü
- Dinamik hava durumu entegrasyonu
- Maksimum 1000 iterasyon

### Genetik Algoritma

Genetik Algoritma, evrimsel ilkeleri kullanarak optimal rotayı bulur:

1. **Başlangıç Popülasyonu**: Rastgele rotalar oluşturulur
2. **Fitness Değerlendirmesi**: Her rotanın yakıt tüketimi hesaplanır
3. **Seçim**: En iyi rotalar seçilir (tournament selection)
4. **Çaprazlama**: İki ebeveyn rotadan yeni rota oluşturulur
5. **Mutasyon**: Rastgele değişiklikler yapılır
6. **Tekrar**: Belirli nesil sayısı kadar tekrarlanır

**Parametreler:**
- Popülasyon: 30-50 birey
- Nesil: 50-100
- Mutasyon oranı: 0.1
- Çaprazlama oranı: 0.8
- Elite sayısı: 5

### Gemi Performans Modeli

**Holtrop & Mennen Yöntemi** ile gemi direnci hesaplanır:

```
R_T = R_F(1+k₁) + R_APP + R_W + R_B + R_TR + R_A
```

- **R_F**: Sürtünme direnci
- **R_W**: Dalga yapma direnci
- **R_B**: Yumru baş direnci
- **R_A**: Hava direnci

**Yakıt Tüketimi:**

```
Fuel Rate = Base Rate × (Speed Ratio)³ × Weather Factor
```

**CII Hesaplama:**

```
CII = Total CO₂ (g) / (Capacity (ton) × Distance (nm))
```

## Veri Kaynakları

### NOAA GFS (Global Forecast System)
- Küresel hava durumu tahminleri
- 0.25° çözünürlük
- Rüzgar hızı ve yönü
- Atmosferik basınç
- Sıcaklık

### Open-Meteo Marine API
- Dalga yüksekliği
- Dalga periyodu ve yönü
- Okyanus akıntıları
- Deniz yüzeyi sıcaklığı

### Yakıt Dönüşüm Faktörleri (IMO)

| Yakıt Tipi | CF (t-CO₂/t-Yakıt) |
|------------|-------------------|
| HFO        | 3.114             |
| LFO        | 3.151             |
| MGO/MDO    | 3.206             |
| LNG        | 2.750             |
| Methanol   | 1.375             |

## Test Senaryoları

Proje, aşağıdaki test senaryolarını içerir:

1. **Akdeniz Rotası**: İstanbul → Napoli
2. **Yakıt Tüketimi Hesaplama**: Farklı hızlarda doğrulama
3. **CII Hesaplama**: IMO standartlarına uygunluk
4. **Great Circle Mesafe**: Haversine formülü doğruluğu

Testleri çalıştırmak için:

```bash
pnpm test
```

## Akademik Referanslar

Bu proje, aşağıdaki akademik çalışmalara ve standartlara dayanmaktadır:

1. **IMO MEPC** - Marine Environment Protection Committee
2. **ISO 15016:2015** - Ships and marine technology — Guidelines for the assessment of speed and power performance
3. **Holtrop & Mennen (1982)** - An approximate power prediction method
4. **NOAA** - National Oceanic and Atmospheric Administration
5. **GEBCO** - General Bathymetric Chart of the Oceans

## Gelecek Çalışmalar

- **Derin Pekiştirmeli Öğrenme (DRL)**: Daha dinamik ve öğrenen bir optimizasyon sistemi
- **Gerçek AIS Verileri**: Tarihsel gemi hareketleri ile model validasyonu
- **Çoklu Hedef Optimizasyonu**: Yakıt + Zaman + Güvenlik
- **Liman Kısıtları**: Giriş/çıkış koridorları, trafik ayrım şemaları
- **Fouling Etkisi**: Gemi gövdesindeki kirlenmenin zamanla modellenmesi

## Lisans

Bu proje, akademik araştırma amaçlı geliştirilmiştir.

## İletişim

Proje hakkında sorularınız için lütfen GitHub Issues kullanın.

---

**Geliştirici:** Manus AI  
**Tarih:** 2025  
**Versiyon:** 1.0.0
