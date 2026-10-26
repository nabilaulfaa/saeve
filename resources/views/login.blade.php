<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Masuk staf · SAEVÉ</title>
<link rel="stylesheet" href="{{ asset('saeve/style.css') }}"><link rel="stylesheet" href="{{ asset('saeve/staff.css') }}"></head><body>
<header class="top"><a href="/" class="nav">Toko</a><span class="logo">SAEVÉ</span><span class="nav r"></span></header>
<main style="max-width:420px"><div class="hd"><div class="eb">Staf</div><h1>Masuk</h1><div class="rule"></div></div>
<form method="POST" action="/masuk" class="box">@csrf
<div class="fl">Email<input name="email" type="email" value="{{ old('email') }}" required autofocus></div>
<div class="fl">Password<input name="password" type="password" required></div>
@error('email')<div class="err">{{ $message }}</div>@enderror
<button class="btn pri">MASUK</button></form></main></body></html>