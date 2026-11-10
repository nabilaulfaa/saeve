<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <title>SAEVÉ</title>
    <link rel="stylesheet" href="{{ asset('saeve/css/style.css') }}">
</head>
<body>
    <header class="top">
        <a href="#/" class="logo">SAEVÉ</a>
        <nav class="menu">
            <a href="#/koleksi">Koleksi</a>
            <a href="#/" data-goto="gallery">Gallery</a>
            <a href="#/" data-goto="kontak">Kontak</a>
            <a href="#/pesanan">Cek Pesanan</a>
        </nav>
    </header>

    <main id="app"></main>

    <footer>© 2026 Saevé. Seluruh hak cipta dilindungi undang-undang. — saeve.store</footer>

    <a href="#/keranjang" class="fab" id="fab">
        <span class="ic">
            <svg viewBox="0 0 24 24" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>
            <b id="cnt" hidden>0</b>
        </span>
        <span>Orders</span>
    </a>
    <div id="toast" class="toast"></div>

    {{-- Urutan penting: pdf.js -> common -> api -> app --}}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="{{ asset('saeve/js/common.js') }}"></script>
    <script src="{{ asset('saeve/js/api.js') }}"></script>
    <script src="{{ asset('saeve/js/app.js') }}"></script>
</body>
</html>
