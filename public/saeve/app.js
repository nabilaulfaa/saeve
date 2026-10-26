const $=s=>document.querySelector(s),app=$('#app'),esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const WA=[['Min sae','6281232289050','0812-3228-9050'],['Min vé','6288226102822','0882-2610-2822']];
const CATS=['semua','gelang','kalung','cincin','anting','bagcharm'];
const CL={bagcharm:'Bag Charm'},cl=c=>CL[c]||c[0].toUpperCase()+c.slice(1);
const ST={menunggu_ongkir:'Menunggu ongkir',menunggu_bayar:'Menunggu pembayaran',diproses:'Diproses',dikirim:'Dikirim',siap_ambil:'Siap diambil',selesai:'Selesai',dibatalkan:'Dibatalkan'};
const STEPS=['menunggu_ongkir','menunggu_bayar','diproses','dikirim','selesai'];
let cart=[];try{cart=JSON.parse(localStorage.getItem('saeve-cart-v2'))||[]}catch(e){}
const saveCart=()=>{localStorage.setItem('saeve-cart-v2',JSON.stringify(cart));$('#cnt').textContent=cart.reduce((a,i)=>a+i.qty,0)};
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2200)};
const wa=(n,t)=>`https://wa.me/${n}?text=${encodeURIComponent(t)}`;
const head=(eb,t,sub)=>`<div class="hd"><div class="eb">${eb}</div><h1>${t}</h1><div class="rule"></div>${sub?`<p class="sub">${sub}</p>`:''}</div>`;
const total=()=>cart.reduce((s,i)=>{const r=API.findVariant(i.variantId);return s+(r?r.p.price*i.qty:0)},0);
const stockTag=p=>{const t=p.variants.reduce((a,v)=>a+v.stock,0);return t===0?'<span class="tag">Habis</span>':t<=5?'<span class="tag">Stok terbatas</span>':''};
const card=p=>`<a class="card" href="#/produk/${p.id}"><div class="ph" style="--c:${p.color}">${esc(p.name[0])}</div><h3>${esc(p.name)}</h3><span class="price">${rp(p.price)}</span> ${stockTag(p)}</a>`;
const waBtns=()=>WA.map(w=>`<a class="btn" target="_blank" rel="noopener" href="${wa(w[1],'Halo, saya tertarik dengan katalog produk SAEVÉ dan ingin bertanya lebih lanjut.')}">Pesan · ${w[0]}</a>`).join('');
const V={
home:()=>head('2026','SAEVÉ Catalog','Jelajahi seluruh koleksi kami dalam satu halaman.')+`<div class="frame" id="pbox"><div class="pwrap"><canvas id="pdf"></canvas></div></div>
 <div class="ctl"><button id="pprev" aria-label="Sebelumnya">‹</button><span id="pgn">Hal. 1 / –</span><button id="pnext" aria-label="Berikutnya">›</button><i></i><button id="pzo" aria-label="Perkecil">−</button><span id="zm">100%</span><button id="pzi" aria-label="Perbesar">+</button><i></i><button id="pfs" aria-label="Layar penuh">⛶</button></div>
 <p class="sub" style="text-align:center">Gunakan panah untuk membaca antar halaman, atau unduh berkas lengkapnya ke perangkat Anda.</p>
 <div class="acts"><a class="btn pri" href="#/koleksi">Lihat koleksi</a><a class="btn" href="/saeve/SAEVE-Catalog-2026.pdf" download>Unduh katalog (PDF)</a>${waBtns()}</div>
 <section style="margin-top:56px"><div class="hd"><div class="eb">SAEV<span style="color:var(--maroon)">É</span></div><h2>Gallery</h2><div class="rule"></div></div><p class="sub" style="text-align:center">Belum ada foto di galeri.</p></section>`,
koleksi(p){const cat=p[0]||'semua';return head('Koleksi','Perhiasan SAEVÉ')+`<div class="pills">${CATS.map(c=>`<a class="pill ${c===cat?'on':''}" href="#/koleksi/${c}">${cl(c)}</a>`).join('')}</div><div class="grid">${API.getProducts(cat).map(card).join('')||'<p class="sub">Produk tidak ditemukan.</p>'}</div>`},
produk(p){const pr=API.getProduct(p[0]);if(!pr)return'<p>Produk tidak ditemukan.</p>';
 app.innerHTML=`<div class="two"><div class="frame" style="width:100%"><div class="ph" style="--c:${pr.color};font-size:6rem">${esc(pr.name[0])}</div></div><div><div class="eb">${cl(pr.category)}</div><h1 style="text-align:left">${esc(pr.name)}</h1><div class="price" style="font-size:1.5rem">${rp(pr.price)}</div><p>${esc(pr.description)}</p><p class="sub">Bahan: ${esc(pr.material)}</p>
 <div class="fl">Varian<select id="vr">${pr.variants.map(v=>`<option value="${v.id}" ${v.stock?'':'disabled'}>${esc(v.color+(v.size?' · '+v.size:''))} — ${v.stock?'stok '+v.stock:'habis'}</option>`).join('')}</select></div>
 <div class="fl">Jumlah<input id="qt" type="number" min="1" value="1" style="width:100px"></div><button class="btn pri" id="add">TAMBAH KE PESANAN</button></div></div>`;
 $('#add').onclick=()=>{const id=$('#vr').value,q=Math.max(1,+$('#qt').value||1),{v}=API.findVariant(id),ex=cart.find(i=>i.variantId===id),n=(ex?ex.qty:0)+q;
  if(n>v.stock)return toast('Stok tidak cukup');ex?ex.qty=n:cart.push({variantId:id,qty:q});saveCart();toast('Ditambahkan ke pesanan')};return null},
keranjang(){if(!cart.length)return head('Pesanan','Keranjang')+'<p class="sub" style="text-align:center">Keranjang masih kosong.</p><div class="acts"><a class="btn pri" href="#/koleksi">Lihat koleksi</a></div>';
 return head('Pesanan','Keranjang')+`<div class="box">${cart.map((i,x)=>{const{p,v}=API.findVariant(i.variantId);return`<div class="sum"><span>${esc(p.name)} <small>${esc(v.color+(v.size?' · '+v.size:''))} × ${i.qty}</small></span><span>${rp(p.price*i.qty)} <button class="btn" data-del="${x}" style="padding:2px 10px">×</button></span></div>`}).join('')}<div class="sum t"><span>Subtotal</span><span>${rp(total())}</span></div></div><div class="acts"><a class="btn pri" href="#/checkout">Checkout</a></div>`},
checkout(){if(!cart.length)return V.keranjang();return head('Checkout','Data pemesan')+`<div class="two"><form id="co" class="box" novalidate><div class="fl">Nama<input name="name"></div><div class="fl">No. WhatsApp<input name="phone" placeholder="08xx xxxx xxxx"></div>
 <div class="fl">Penerimaan<select name="delivery"><option value="kirim">Dikirim (ongkir ditetapkan admin)</option><option value="pickup">Ambil di toko</option></select></div>
 <div id="ad"><div class="fl">Alamat<input name="address"></div><div class="fl">Kota/kabupaten<input name="city"></div><div class="fl">Kode pos<input name="postal"></div></div><div class="err" id="er"></div><button class="btn pri">BUAT PESANAN</button></form>
 <div class="box"><h2>Ringkasan</h2>${cart.map(i=>{const{p}=API.findVariant(i.variantId);return`<div class="sum"><span>${esc(p.name)} × ${i.qty}</span><span>${rp(p.price*i.qty)}</span></div>`}).join('')}<div class="sum t"><span>Subtotal</span><span>${rp(total())}</span></div></div></div>`},
pesanan(){return head('Pesanan','Cek pesanan','Masukkan nomor pesanan dan nomor telepon saat checkout.')+`<form id="tf" class="box" style="max-width:460px;margin:auto"><div class="fl">Nomor pesanan<input name="code" placeholder="SV-1001"></div><div class="fl">Nomor telepon<input name="tel"></div><div class="err" id="er"></div><button class="btn pri">CEK STATUS</button></form>`},
struk(p){const o=API.getOrder(p[0]);if(!o)return'<p>Struk tidak ditemukan.</p>';const d=new Date(o.createdAt).toLocaleString('id-ID');const cur=STEPS.indexOf(o.status);
 return head('Pesanan '+o.code,ST[o.status]||o.status)+`<div class="rc"><span class="logo">SAEV<span style="color:var(--maroon)">É</span></span><p class="sub" style="font-size:.9rem">a symphony of grace, where every whispers elegance.</p><hr>
 <div class="sum"><span>No.</span><b>${o.code}</b></div><div class="sum"><span>Tanggal</span><span>${d}</span></div><div class="sum"><span>Pemesan</span><span>${esc(o.name)}</span></div><hr>
 ${o.items.map(i=>`<div class="sum"><span>${esc(i.productName)}<br><small>${esc(i.color+(i.size?' · '+i.size:''))} · ${i.qty} × ${rp(i.unitPrice)}</small></span><span>${rp(i.qty*i.unitPrice)}</span></div>`).join('')}<hr>
 <div class="sum"><span>Subtotal</span><span>${rp(o.subtotal)}</span></div><div class="sum"><span>Ongkir</span><span>${o.delivery==='kirim'&&!o.shippingFee?'Ditetapkan admin':rp(o.shippingFee)}</span></div><div class="sum t"><span>TOTAL</span><span>${o.delivery==='kirim'&&!o.shippingFee?'Subtotal + ongkir':rp(o.total)}</span></div>
 <hr><ul class="tl">${STEPS.map((s,i)=>`<li class="${i<=cur?'on':''}">${ST[s]}</li>`).join('')}</ul><hr><p class="sub" style="font-size:.9rem">Terima kasih telah memilih SAEVÉ. Hindari air, parfum, dan bahan kimia agar kilau manik terjaga.</p></div>
 <div class="acts"><button class="btn pri" onclick="print()">Cetak struk</button>${WA.map(w=>`<a class="btn" target="_blank" href="${wa(w[1],'Halo, saya ingin konfirmasi pesanan '+o.code)}">Chat ${w[0]}</a>`).join('')}</div>`}};
async function route(){const[,r='home',...p]=(location.hash||'#/').slice(1).split('/');
 try{await API.load()}catch(e){app.innerHTML='<p class="sub" style="text-align:center">Gagal memuat produk. Pastikan server Laravel berjalan dan migrasi sudah dijalankan.</p>';return}
 cart=cart.filter(i=>API.findVariant(i.variantId));saveCart();const f=V[r||'home']||V.home;const h=f(p);if(h!=null)app.innerHTML=h;scrollTo(0,0);bind()}
function bind(){if($('#pdf'))initPdf();
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{cart.splice(+b.dataset.del,1);saveCart();route()});
 const co=$('#co');if(co){const ad=$('#ad');co.delivery.onchange=()=>ad.style.display=co.delivery.value==='kirim'?'':'none';
  co.onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(co)),er=$('#er');const tel=f.phone.replace(/\D/g,'');
   if(f.name.trim().length<3)return er.textContent='Masukkan nama.';if(!/^08\d{8,12}$/.test(tel))return er.textContent='Gunakan nomor yang diawali 08.';
   if(f.delivery==='kirim'&&(f.address.trim().length<8||f.city.trim().length<3||!/^\d{5}$/.test(f.postal)))return er.textContent='Lengkapi alamat, kota, dan kode pos 5 angka.';
   try{const o=await API.createOrder(f,cart);cart=[];saveCart();location.hash='#/struk/'+o.code}catch(x){er.textContent=x.message}}}
 const tf=$('#tf');if(tf)tf.onsubmit=async e=>{e.preventDefault();const o=await API.lookupOrder(tf.code.value,tf.tel.value);o?location.hash='#/struk/'+o.code:$('#er').textContent='Pesanan tidak ditemukan. Periksa nomor pesanan dan telepon.'}}
let PDFD=null,PG=1,ZM=1,BUSY=false,AGAIN=false;
async function renderPg(){const cv=$('#pdf');if(!cv||!PDFD)return;if(BUSY){AGAIN=true;return}BUSY=true;
 try{const p=await PDFD.getPage(PG),w=cv.parentNode.clientWidth,v0=p.getViewport({scale:1}),vp=p.getViewport({scale:w/v0.width*2});
  cv.width=vp.width;cv.height=vp.height;cv.style.width=ZM*100+'%';await p.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
  $('#pgn').textContent='Hal. '+PG+' / '+PDFD.numPages;$('#zm').textContent=Math.round(ZM*100)+'%'}catch(e){}
 BUSY=false;if(AGAIN){AGAIN=false;renderPg()}}
async function initPdf(){const box=$('#pbox');
 $('#pprev').onclick=()=>{PG=Math.max(1,PG-1);renderPg()};$('#pnext').onclick=()=>{if(PDFD){PG=Math.min(PDFD.numPages,PG+1);renderPg()}};
 $('#pzo').onclick=()=>{ZM=Math.max(.5,ZM-.25);renderPg()};$('#pzi').onclick=()=>{ZM=Math.min(2.5,ZM+.25);renderPg()};
 $('#pfs').onclick=()=>box.requestFullscreen&&box.requestFullscreen();
 try{if(!PDFD){pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';PDFD=await pdfjsLib.getDocument('/saeve/SAEVE-Catalog-2026.pdf').promise}renderPg()}
 catch(e){box.innerHTML='<p class="sub" style="text-align:center">Pratinjau katalog tidak tersedia. Gunakan tombol unduh.</p>'}}
addEventListener('hashchange',route);saveCart();route();