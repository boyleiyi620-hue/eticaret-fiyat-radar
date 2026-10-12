# Eticaret Fiyat Radar

Demo static web app for comparing prices across marketplaces and spotting where the same product is priced higher elsewhere.

## Özellikler
- Market bazlı fiyat karşılaştırma
- Arama ve filtreleme
- Fiyat farkı ve oranı gösterimi
- Paylaşma akışı için iki ürün bağlantısı
- Ayarlar ekranı (API alanları, kategori seçimi, eşik değeri)
- GitHub Pages için uygun tek sayfalı statik yapı

## Çalıştırma

Yerel olarak açmak için:

```bash
ruby -run -e httpd . -p 8000
```

Sonra tarayıcıda:

```text
http://localhost:8000/
```

## Not
Bu uygulama demo amaçlıdır. Gerçek canlı veri akışı için resmi marketplace API erişimi ve ilgili izinler gerekir.
