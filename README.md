# Fiyat Radar

Ücretsiz, statik bir fiyat takip arayüzü. Fiyat akışındaki ürünler demo verisidir; gerçek pazaryeri fiyat takibi için pazaryerlerinin yetkili API'leri ve sunucu entegrasyonu gerekir.

## Yerelde çalıştırma

Google'ın oturum açma bileşeni `file://` adresinde çalışmaz. Projeyi yerel bir web sunucusuyla açın:

```sh
python3 -m http.server 8000
```

Ardından `http://localhost:8000` adresine gidin. Uygulamanın temel demo özellikleri API anahtarı olmadan çalışır.

## Ücretsiz Gemini AI

1. [Google AI Studio'dan](https://aistudio.google.com/app/apikey) kendi Gemini API anahtarınızı oluşturun.
2. Uygulamada **Ayarlar → AI kategori taraması** alanına anahtarı girip **Anahtarı bu oturumda kullan** düğmesine basın.
3. **AI asistan** ile sohbet edin veya **Video stüdyosu** içinde bir AI storyboard hazırlayın.

API istekleri ve yazdığınız mesajlar Google Gemini'ye gönderilir. Anahtar tarayıcı depolamasına yazılmaz; yalnızca açık sekmenin belleğinde tutulur. Google'ın ücretsiz kota, model erişimi ve kullanım koşulları zamanla değişebilir. Bu, üretim ortamında güvenli bir API anahtarı saklama yöntemi değildir; herkese açık bir uygulamada anahtarı sunucu tarafında koruyun ve kullanıcı başına erişimi sınırlandırın. API anahtarını herkese açık veya ortak cihazlarda kullanmayın.

Video stüdyosu storyboard'u hareketli tasarım metinlerine dönüştürür ve WebM olarak dışa aktarır. Ücretsiz/çevrimdışı örnek storyboard da kullanılabilir. Gerçekçi AI video üretimi yapmaz; ücretli video üretim servislerine istek göndermez.

## Google hesabıyla giriş

1. [Google Cloud Console'da](https://console.cloud.google.com/apis/credentials) ücretsiz bir **OAuth 2.0 Web application** istemcisi oluşturun.
2. Uygulamayı açtığınız adresi (örneğin `http://localhost:8000`) **Authorized JavaScript origins** listesine ekleyin.
3. Oluşturulan Web Client ID değerini uygulamada **Ayarlar → Google hesabıyla giriş** bölümüne kaydedin.
4. Google'ın hesap seçicisini açmak için **Google ile giriş** düğmesine basın.

Bu tek dosyalı demo yalnızca seçilen Google profil adını bu sekmede gösterir. Kimlik doğrulaması sunucuda doğrulanmadığından bu bir güvenli uygulama hesabı/üyelik sistemi değildir; Google hesabına veri kaydetmez. Gerçek kullanıcı hesabı, erişim denetimi ve kalıcı senkronizasyon için sunucu tarafı ID token doğrulaması ve bir veritabanı gerekir.
