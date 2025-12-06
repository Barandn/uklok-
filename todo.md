# Yeşil Deniz Taşımacılığı Projesi - TODO Listesi

## Veritabanı ve Şema
- [x] Gemiler tablosu (vessels) - gemi özellikleri, DWT, hız, yakıt tipi
- [x] Rotalar tablosu (routes) - optimize edilmiş rotalar
- [x] Waypoint'ler tablosu (waypoints) - rota noktaları
- [x] Simülasyonlar tablosu (simulations) - simülasyon sonuçları
- [x] Hava durumu önbellek tablosu (weather_cache) - METOC verileri

## Veri Kaynakları Entegrasyonu
- [x] NOAA GFS hava durumu API entegrasyonu
- [x] WaveWatch III dalga verileri entegrasyonu
- [x] Copernicus Marine Service akıntı verileri
- [x] GEBCO batimetri verileri entegrasyonu
- [ ] AIS veri işleme modülü

## Gemi Performans Modeli
- [x] Holtrop & Mennen direnç hesaplama modülü
- [x] Yakıt tüketimi hesaplama fonksiyonu
- [x] CII (Carbon Intensity Indicator) hesaplama
- [x] Yakıt dönüşüm faktörleri (CF) veritabanı
- [x] Hava durumu etkisi modelleme (rüzgar, dalga direnci)
- [x] Digital Twin (Sanal Gemi) sınıfı

## Rota Optimizasyon Algoritmaları
- [x] A* algoritması - temel implementasyon
- [x] A* için maliyet fonksiyonu (yakıt + emisyon)
- [x] A* için heuristik fonksiyon (Great Circle)
- [x] Genetik Algoritma - populasyon yönetimi
- [x] Genetik Algoritma - crossover operatörü
- [x] Genetik Algoritma - mutasyon operatörü
- [x] Genetik Algoritma - fitness fonksiyonu
- [x] Hibrit optimizasyon (A* + GA kombinasyonu)
- [x] Coğrafi kısıtlar (kara, sığ su kontrolü)
- [x] Dinamik hava durumu entegrasyonu

## Backend API (tRPC)
- [x] Gemi CRUD işlemleri
- [x] Rota optimizasyon endpoint'i
- [x] Simülasyon başlatma endpoint'i
- [x] Hava durumu veri çekme endpoint'i
- [x] Rota karşılaştırma endpoint'i
- [x] CII hesaplama endpoint'i
- [x] Sonuç kaydetme ve listeleme

## Frontend Arayüz
- [x] Ana sayfa tasarımı
- [x] Harita entegrasyonu (Google Maps)
- [x] Başlangıç/varış noktası seçimi
- [x] Gemi seçimi ve parametreleri formu
- [x] Optimizasyon parametreleri (yakıt tipi, hız, vb.)
- [x] Rota görselleştirme (A*, GA, Great Circle karşılaştırması)
- [x] Sonuç tablosu (yakıt, emisyon, mesafe, süre)
- [x] CII skor göstergesi
- [ ] Hava durumu katmanları görselleştirme
- [ ] What-if senaryo analizi arayüzü
- [x] Simülasyon geçmişi

## Test ve Simülasyon
- [x] Unit testler - algoritma fonksiyonları
- [ ] Unit testler - veri entegrasyon modülleri
- [ ] Integration testler - API endpoint'leri
- [x] Test senaryosu 1: Akdeniz rotası
- [ ] Test senaryosu 2: Atlantik geçişi
- [ ] Test senaryosu 3: Uzak Doğu rotası
- [ ] Performans testleri
- [ ] Doğrulama - gerçek AIS verileri ile karşılaştırma

## Akademik Dokümantasyon
- [x] README.md - proje tanıtımı
- [ ] ARCHITECTURE.md - sistem mimarisi
- [ ] API_DOCUMENTATION.md - API referansı
- [ ] ALGORITHMS.md - algoritma detayları
- [x] RESEARCH_REPORT.md - akademik rapor
- [x] Matematiksel formüller dokümantasyonu
- [x] Veri kaynakları ve referanslar
- [x] Sonuçlar ve bulgular
- [x] Gelecek çalışmalar önerileri

## Deployment ve GitHub
- [ ] Docker containerization
- [ ] Environment variables yapılandırması
- [ ] GitHub repository oluşturma
- [ ] .gitignore yapılandırması
- [ ] LICENSE dosyası
- [ ] Kod yorumları ve dokümantasyon
- [ ] Örnek veri setleri

## Yeni Geliştirmeler (Kullanıcı Talebi)
- [x] Gerçek NOAA GFS API entegrasyonu - canlı hava durumu
- [x] Gerçek Open-Meteo Marine API entegrasyonu - dalga ve akıntı
- [x] Haritada rota çizimi - yeşil şerit (polyline)
- [x] Optimize edilmiş rotayı haritada görselleştirme
- [x] Waypoint'leri haritada işaretleme
- [x] Gerçek verilerle rota hesaplama testi

## KRİTİK SORUNLAR (Kullanıcı Raporu)
- [x] Rota kara üzerinden geçiyor - deniz rotası olmalı
- [x] Kara kontrolü (isPointOnLand) çalışmıyor veya yetersiz
- [x] A* algoritması kara noktalarını engellemeli
- [x] Genetik Algoritma kara noktalarını engellemeli
- [x] İlerleme çubuğu ve anlık güncellemeler eklenmeli

## Yeni Özellikler - ETA ve Metrikler
- [x] ETA (Estimated Time of Arrival) hesaplama
- [x] Kalkış zamanı ve varış zamanı gösterimi
- [x] Ortalama hız metrikleri
- [x] Yakıt maliyeti hesaplama
- [x] CII skoru görselleştirme
- [x] Metrik kartlarını güncelleme

## KRİTİK SORUN - ROTA HALA KARA ÜZERİNDEN GEÇİYOR
- [x] Mevcut isPointOnLand fonksiyonu yetersiz - sadece bölge kontrolü yapıyor
- [x] Gerçek coastline/land polygon verisi kullanılmalı
- [x] Natural Earth veya OpenStreetMap coastline verisi entegre edilmeli
- [x] Point-in-polygon algoritması ile hassas kara kontrolü
- [x] İstanbul-Napoli rotası test edilmeli (Akdeniz üzerinden geçmeli)

## HATA - __dirname Sorunu
- [x] coastline.ts'de __dirname ES modules ile uyumlu değil
- [x] import.meta.url kullanarak düzelt

## KRİTİK - Coastline Dosya Yolu Hatası
- [x] Production build'de coastline dosyası bulunamıyor
- [x] Dosya yolu düzeltilmeli - development ve production uyumlu
- [x] Tüm rota sistemi gözden geçirilmeli
- [x] Sadece deniz rotası garantisi verilmeli
- [x] Coastline testleri geçti (3/3)

## KRİTİK - Frontend Rota Çizimi Yanlış
- [x] Frontend backend'den gelen optimize rotayı kullanmıyor
- [x] Direkt Great Circle çiziyor (düz çizgi)
- [x] Backend A*/GA rotası frontend'e gönderilmeli
- [x] Haritada backend'den gelen waypoint'ler çizilmeli
- [x] Basit rota sistemi eklendi (simple-route.ts)
- [ ] Test: İstanbul-Napoli rotası Akdeniz üzerinden geçmeli

## GitHub Deposu Hazırlığı
- [ ] README.md güncelleme - kurulum ve kullanım
- [ ] .gitignore kontrol
- [ ] LICENSE dosyası kontrol
- [ ] Proje dosyalarını zip olarak hazırlama
- [ ] GitHub deposu oluşturma talimatları
