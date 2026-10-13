# Fiyat Radar

Ücretsiz, statik bir fiyat takip arayüzü. Fiyat akışındaki ürünler demo verisidir; gerçek pazaryeri fiyat takibi için pazaryerlerinin yetkili API'leri ve sunucu entegrasyonu gerekir.

## Yerelde çalıştırma

Supabase Auth ve servis çalışanı `file://` adresinde çalışmaz. Projeyi yerel bir web sunucusuyla açın:

```sh
python3 -m http.server 8000
```

Ardından `http://localhost:8000` adresine gidin. E-posta/şifre ile hesap oluşturmak veya giriş yapmak için Supabase bağlantısı gerekir. Google ile giriş yoktur.

## Supabase Auth ve takip listesi

Uygulama Supabase'in ücretsiz Auth altyapısını ve `tracked_products` tablosunu kullanır. Takip listesi özelliklerini etkinleştirmek için Supabase SQL Editor'da aşağıdaki şemayı bir kez çalıştırın. Row Level Security (RLS), her hesabın yalnızca kendi ürünlerini okumasını, eklemesini ve silmesini sağlar.

```sql
create table if not exists public.tracked_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  product_url text not null check (char_length(product_url) <= 2048),
  target_price numeric(12, 2) check (target_price is null or target_price > 0),
  created_at timestamptz not null default now()
);

create index if not exists tracked_products_user_created_idx
  on public.tracked_products (user_id, created_at desc);

alter table public.tracked_products enable row level security;
grant select, insert, delete on public.tracked_products to authenticated;

drop policy if exists "Users can read their own tracked products" on public.tracked_products;
create policy "Users can read their own tracked products"
  on public.tracked_products for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own tracked products" on public.tracked_products;
create policy "Users can add their own tracked products"
  on public.tracked_products for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own tracked products" on public.tracked_products;
create policy "Users can delete their own tracked products"
  on public.tracked_products for delete to authenticated
  using ((select auth.uid()) = user_id);
```

İstemci tarafında yalnızca Supabase publishable anahtarı bulunur; bu statik uygulamaya secret/service-role anahtarı eklemeyin. Supabase Auth **Site URL** ve izin verilen yönlendirme adreslerini yayımlanan siteyle (yerel test için `http://localhost:8000`) eşleştirin.

## Ücretsiz Gemini AI

1. [Google AI Studio'dan](https://aistudio.google.com/app/apikey) kendi Gemini API anahtarınızı oluşturun.
2. Uygulamada **Ayarlar → AI kategori taraması** alanına anahtarı girip **Anahtarı bu oturumda kullan** düğmesine basın.
3. **AI asistan** ile sohbet edin veya **Video stüdyosu** içinde bir AI storyboard hazırlayın.

API istekleri ve yazdığınız mesajlar Google Gemini'ye gönderilir. Anahtar tarayıcı depolamasına yazılmaz; yalnızca açık sekmenin belleğinde tutulur. Google'ın ücretsiz kota, model erişimi ve kullanım koşulları zamanla değişebilir. Bu, üretim ortamında güvenli bir API anahtarı saklama yöntemi değildir; herkese açık bir uygulamada anahtarı sunucu tarafında koruyun ve kullanıcı başına erişimi sınırlandırın. API anahtarını herkese açık veya ortak cihazlarda kullanmayın.

Video stüdyosu storyboard'u hareketli tasarım metinlerine dönüştürür ve WebM olarak dışa aktarır. Ücretsiz/çevrimdışı örnek storyboard da kullanılabilir. Gerçekçi AI video üretimi yapmaz; ücretli video üretim servislerine istek göndermez.
