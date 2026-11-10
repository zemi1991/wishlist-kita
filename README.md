# Wishlist Kita

App kecil untuk kami berdua simpan benda menarik (tempat makan, barang nak beli, tempat jalan, idea) dan peringatan tarikh penting.

- **App:** https://zemi1991.github.io/wishlist-kita/
- **Data:** Supabase (`supabase.sql` = struktur database & peraturan akses)
- **Host:** GitHub Pages (branch `main`, folder root)

## Fail
| Fail | Guna |
|---|---|
| `index.html` | Seluruh app (UI + logik) |
| `config.js` | Project URL & anon key Supabase (anon key memang untuk public; data dilindungi RLS) |
| `manifest.webmanifest`, `sw.js`, `*.png` | Supaya boleh "Add to Home Screen" macam app |
| `supabase.sql` | Jalankan sekali dalam Supabase SQL Editor |

## Tambah ahli
Tambah email dalam jadual `members`, dan buat akaun yang sama dalam Supabase > Authentication > Users (Auto Confirm).
