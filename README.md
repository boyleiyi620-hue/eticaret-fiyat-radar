# Fiyat Radar

Amazon Türkiye, Trendyol, Hepsiburada ve n11’de bulduğun ürün ilanlarını tek listede karşılaştıran ücretsiz bir web uygulaması. **Sahte/demo fiyat içermez.** Her fiyat kullanıcı tarafından mağaza sayfasında görülüp kaydedilir; en düşük fiyat, en yüksek fiyat ve farkı uygulama otomatik hesaplar.

## Ürün arama ve fiyat karşılaştırma

Bir ürünü eklediğinde kartındaki mağaza bağlantıları aynı ürün adını ilgili mağazanın gerçek arama sayfasında arar. İlanın satıcısını, ürün varyantını, kargo ücretini ve güncel fiyatını mağazada kontrol et; sonra ürün bağlantısı ve fiyatı kaydet. Aynı ürün için mağazalardan yeni fiyatlar eklendikçe ana ekrandaki karşılaştırma güncellenir. Fiyatlar otomatik yenilenmez; eski fiyatların yanında kayıt zamanı görünür.

Bu dört mağazanın ücretsiz, herkese açık ve tüketici kataloğundaki tüm satıcı fiyatlarını arayan bir API’si bu uygulama için mevcut değil. Mağaza API’leri çoğunlukla satıcı/iş ortağı katalog, sipariş veya entegrasyon işlemlerine yöneliktir. Amazon Creators API için Associates üyeliği ve son 30 günde en az 10 nitelikli satış gerekir. Yetkisiz web kazıma, ücretli arama API’si ve AI tarafından uydurulmuş fiyat kullanılmaz. Bu nedenle mağaza API anahtarları istenmez.

Resmî kaynaklar:
- [Amazon Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)
- [Trendyol Marketplace API](https://developers.trendyol.com/v3.0/docs/getting-started-1)
- [Hepsiburada Developer Portal](https://developers.hepsiburada.com/tr)
- [n11 Developer Portal](https://developer.n11.com/)

## Yerel çalıştırma

```sh
python3 -m http.server 8000
```

Ardından `http://localhost:8000` adresini aç. Yerel testte Gemini isteği doğrudan Google API’ye gider. Vercel dağıtımında aynı kaynaklı `/api/gemini` işlevi kullanılır.

## Supabase

Uygulama bağlı ücretsiz Supabase projesinin Auth hizmetini, `tracked_products` tablosunu ve `marketplace_offers` tablosunu kullanır. Her iki tabloda Row Level Security etkin ve kayıtlar yalnızca oturum açmış sahibine görünür. İlan/fiyat tablosunun şeması `supabase/migrations/20261015000000_marketplace_offers.sql` dosyasındadır. Tarayıcıda yalnızca herkese açık Supabase publishable anahtarı bulunur; service-role anahtarı kullanılmaz.

Supabase Auth e-posta doğrulama bağlantısı için yayımlanan site adresi izin verilen yönlendirme adresleri arasında olmalıdır.

## Ücretsiz Gemini sohbeti ve video storyboard’u

Ayarlar’da [Google AI Studio](https://aistudio.google.com/apikey) üzerinden aldığın API anahtarını girip doğrula. Uygulama yalnızca `gemini-3.5-flash-lite` modelini kullanır; ücretli modele, Google Search grounding’e veya ücretli video hizmetine geçmez. Google’ın ücretsiz kota, model erişimi ve bölgesel kullanılabilirlik sınırları geçerlidir.

Anahtar yalnızca açık sekmenin belleğinde tutulur. Yayımlanmış sürümde istek süresince Vercel işlevine iletilir; uygulama anahtarı kaydetmez veya loglamaz. Yazdığın mesajlar Google Gemini API’sine gönderilir. Sohbet kaydedilmiş fiyatları bağlam olarak kullanabilir; mağazaları gerçek zamanlı tarayamaz.

Video stüdyosu Gemini’den metinsel storyboard alabilir ve tarayıcıda sessiz, hareketli metinlerden WebM videosu oluşturabilir. Bu, gerçekçi AI video/görüntü üretimi değildir; dışa aktarma tarayıcının `MediaRecorder` desteğine bağlıdır.

## Yayınlama

Depo Vercel Hobby (ücretsiz) hesabına bağlıdır. Statik uygulama ve `api/gemini.js` aynı dağıtımda yayınlanır. Supabase/Vercel kota ve ücretsiz plan sınırları geçerlidir; ücretli servis veya ücretli mağaza API’si eklenmemiştir.
