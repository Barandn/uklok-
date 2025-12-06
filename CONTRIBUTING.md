# Katkıda Bulunma Rehberi

Bu projeye katkıda bulunmak istediğiniz için teşekkür ederiz! Bu belge, projeye nasıl katkıda bulunabileceğinizi açıklamaktadır.

## Geliştirme Ortamı Kurulumu

### Gereksinimler
- Node.js 22+
- pnpm 10+
- MySQL veya TiDB database

### Kurulum Adımları

```bash
# Depoyu klonlayın
git clone https://github.com/yourusername/green_shipping_optimization.git
cd green_shipping_optimization

# Bağımlılıkları yükleyin
pnpm install

# Environment variables'ları ayarlayın
cp .env.example .env
# .env dosyasını düzenleyin

# Veritabanı migrasyonlarını çalıştırın
pnpm db:push

# Development server'ı başlatın
pnpm dev
```

## Kod Standartları

### TypeScript
- Tüm kod TypeScript ile yazılmalıdır
- `any` kullanımından kaçının
- Type safety'yi koruyun

### Kod Stili
- Prettier kullanın: `pnpm format`
- ESLint kurallarına uyun
- Anlamlı değişken isimleri kullanın

### Commit Mesajları
Conventional Commits formatını kullanın:

```
feat: yeni özellik ekle
fix: hata düzeltmesi
docs: dokümantasyon güncellemesi
test: test ekle veya güncelle
refactor: kod yeniden yapılandırma
style: kod formatı değişikliği
chore: build veya yardımcı araç değişikliği
```

## Test Yazma

Her yeni özellik için test yazın:

```bash
# Testleri çalıştırın
pnpm test

# Test coverage'ı kontrol edin
pnpm test:coverage
```

## Pull Request Süreci

1. **Fork** edin ve yeni bir branch oluşturun
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Değişikliklerinizi** yapın ve commit edin
   ```bash
   git commit -m 'feat: add amazing feature'
   ```

3. **Push** edin
   ```bash
   git push origin feature/amazing-feature
   ```

4. **Pull Request** oluşturun
   - Değişikliklerinizi açıklayın
   - İlgili issue'ları referans verin
   - Screenshot ekleyin (UI değişiklikleri için)

## Kod İnceleme

Pull request'iniz şu kriterlere göre incelenecektir:

- [ ] Kod standartlarına uygunluk
- [ ] Test coverage
- [ ] Dokümantasyon güncellemesi
- [ ] Breaking change kontrolü
- [ ] Performance etkisi

## Özellik Önerileri

Yeni özellik önerileri için:

1. GitHub Issues'da yeni bir issue açın
2. Özelliği detaylı açıklayın
3. Use case'leri belirtin
4. Varsa mockup/wireframe ekleyin

## Hata Bildirimi

Hata bildirirken lütfen şunları ekleyin:

- Hatanın açıklaması
- Yeniden üretme adımları
- Beklenen davranış
- Gerçekleşen davranış
- Ekran görüntüleri (varsa)
- Ortam bilgileri (OS, browser, Node.js versiyonu)

## Lisans

Bu projeye katkıda bulunarak, katkılarınızın MIT Lisansı altında lisanslanacağını kabul etmiş olursunuz.

## İletişim

Sorularınız için:
- GitHub Issues
- Discussions bölümü

Katkılarınız için teşekkürler! 🚢
