const $=s=>document.querySelector(s),app=$('#app'),PAGE=document.body.dataset.page;
const rp=n=>'Rp '+Math.round(n||0).toLocaleString('id-ID'),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fd=i=>new Date(i).toLocaleString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const vl=(c,z)=>esc(c+(z?' · '+z:'')),ymd=d=>d.toISOString().slice(0,10),CSRF=$('meta[name=csrf-token]').content;
const ST={menunggu_ongkir:'Menunggu ongkir',menunggu_bayar:'Menunggu pembayaran',diproses:'Diproses',dikirim:'Dikirim',siap_ambil:'Siap diambil',selesai:'Selesai',dibatalkan:'Dibatalkan',tindak_lanjut:'Tindak lanjut'};
const badge=s=>`<span class="bd ${['dibatalkan','tindak_lanjut'].includes(s)?'bad':['selesai','diproses'].includes(s)?'ok':'wait'}">${ST[s]||s}</span>`;
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2400)};
async function api(url,method='GET',body){const r=await fetch('/staff/'+url,{method,headers:{'Content-Type':'application/json','Accept':'application/json','X-CSRF-TOKEN':CSRF},body:body?JSON.stringify(body):undefined});
 const d=await r.json().catch(()=>({}));if(!r.ok){if([401,403,419].includes(r.status))location='/masuk';throw Error(d.message||'Terjadi kesalahan')}return d}
const run=async f=>{try{await f()}catch(e){toast(e.message)}};
const printRc=()=>{document.body.classList.add('printing-rc');print();setTimeout(()=>document.body.classList.remove('printing-rc'),600)};
function receipt(o){const pos=o.channel==='pos',kirim=o.delivery==='kirim';
 return `<div class="rc"><span class="logo">SAEV<span style="color:var(--maroon)">É</span></span><p class="sub" style="font-size:.9rem">a symphony of grace, where every whispers elegance.</p><hr>
 <div class="sum"><span>No.</span><b>${o.code}</b></div><div class="sum"><span>Tanggal</span><span>${fd(o.createdAt)}</span></div><div class="sum"><span>${pos?'Kasir':'Pemesan'}</span><span>${esc(pos?o.cashier:o.name)}</span></div><hr>
 ${o.items.map(i=>`<div class="sum"><span>${esc(i.productName)}<br><small>${vl(i.color,i.size)} · ${i.qty} × ${rp(i.unitPrice)}</small></span><span>${rp(i.qty*i.unitPrice)}</span></div>`).join('')}<hr>
 <div class="sum"><span>Subtotal</span><span>${rp(o.subtotal)}</span></div>${kirim?`<div class="sum"><span>Ongkir</span><span>${rp(o.shippingFee)}</span></div>`:''}<div class="sum t"><span>TOTAL</span><span>${rp(o.total)}</span></div>
 ${pos&&o.payment==='tunai'?`<div class="sum"><span>Tunai</span><span>${rp(o.cash)}</span></div><div class="sum"><span>Kembalian</span><span>${rp(o.change)}</span></div>`:`<div class="sum"><span>Pembayaran</span><span>${o.payment==='tunai'?'Tunai':'Transfer'}</span></div>`}
 ${o.verified?'<div class="stamp">LUNAS</div>':''}<hr><p class="sub" style="font-size:.9rem">Terima kasih telah memilih SAEVÉ.<br>Hindari air, parfum, dan bahan kimia agar kilau manik terjaga.</p><p style="font-size:.8rem;color:var(--mut)">WhatsApp 0812-3228-9050 · 0882-2610-2822</p></div>`}

/* ---------- ADMIN ---------- */
const t0=new Date(),t1=new Date(t0);t1.setDate(t1.getDate()-29);
const A={tab:'orders',orders:[],products:[],f:'semua',sel:null,rc:null,add:false,rep:null,from:ymd(t1),to:ymd(t0),ch:'semua'};
const need=()=>A.orders.filter(o=>['menunggu_ongkir','tindak_lanjut'].includes(o.status)).length;
function drawA(){const tabs=[['orders','Pesanan'],['products','Produk & stok'],['reports','Laporan']];
 app.innerHTML=`<div class="tabs">${tabs.map(([k,l])=>`<button class="pill ${A.tab===k?'on':''}" data-a="tab" data-v="${k}">${l}${k==='orders'&&need()?` (${need()})`:''}</button>`).join('')}</div>`+(A.tab==='orders'?vOrders():A.tab==='products'?vProducts():vReport())}
function vOrders(){const list=A.orders.filter(o=>A.f==='semua'||o.status===A.f),o=A.orders.find(x=>x.code===A.sel);
 return `<h1 class="l">Pesanan online</h1><div class="pills" style="justify-content:flex-start;margin:14px 0">${['semua',...Object.keys(ST)].map(s=>`<button class="pill ${A.f===s?'on':''}" data-a="f" data-v="${s}">${s==='semua'?'Semua':ST[s]}</button>`).join('')}</div>
 <div class="split"><div class="lst">${list.map(x=>`<button class="orow ${x.code===A.sel?'on':''}" data-a="sel" data-v="${x.code}"><span><b>${x.code}</b> · ${esc(x.name)}</span><span>${rp(x.total)} ${badge(x.status)}</span></button>`).join('')||'<p class="sub">Belum ada pesanan.</p>'}</div><div>${o?detail(o):'<p class="sub">Pilih pesanan di sebelah kiri.</p>'}</div></div>`}
function detail(o){const kirim=o.delivery==='kirim',pend=['menunggu_ongkir','menunggu_bayar','tindak_lanjut'].includes(o.status),fin=['selesai','dibatalkan'].includes(o.status);
 const next=o.status==='diproses'?(kirim?['dikirim','Tandai dikirim']:['siap_ambil','Siap diambil']):['dikirim','siap_ambil'].includes(o.status)?['selesai','Tandai selesai']:null;
 return `<div class="box"><div class="sum"><h2 class="l">${o.code}</h2>${badge(o.status)}</div><p class="sub">${esc(o.name)} · ${esc(o.phone)} · ${fd(o.createdAt)}<br>${kirim?esc([o.address,o.city,o.postal].filter(Boolean).join(', ')):'Ambil di toko'}</p>
 ${o.items.map(i=>`<div class="sum"><span>${esc(i.productName)} <small>${vl(i.color,i.size)} × ${i.qty}</small> ${pend?`<span class="bd ${i.stock<i.qty?'bad':'ok'}">stok ${i.stock}</span>`:''}</span><span>${rp(i.qty*i.unitPrice)}</span></div>`).join('')}
 <div class="sum"><span>Subtotal</span><span>${rp(o.subtotal)}</span></div>${kirim?`<div class="sum"><span>Ongkir</span><span>${o.status==='menunggu_ongkir'?'Belum ditetapkan':rp(o.shippingFee)}</span></div>`:''}<div class="sum t"><span>Total</span><span>${rp(o.total)}</span></div>
 ${kirim&&!o.verified&&['menunggu_ongkir','menunggu_bayar'].includes(o.status)?`<div class="fl">Ongkos kirim (Rp)<input id="ship" type="number" min="0" step="500" value="${o.status==='menunggu_ongkir'?'':o.shippingFee}"></div><button class="btn" data-a="ship">Simpan ongkir</button>`:''}
 ${o.status==='menunggu_bayar'?`<p class="sub">Cek mutasi rekening untuk ${rp(o.total)} dari ${esc(o.name)} sebelum memverifikasi.</p><button class="btn pri" data-a="verify">Pembayaran sudah masuk</button>`:''}
 ${o.status==='tindak_lanjut'?`<div class="al">Pembayaran masuk tetapi stok kurang. Tambah stok di tab Produk & stok, lalu proses.</div><button class="btn pri" data-a="status" data-v="diproses">Proses pesanan</button>`:''}
 ${next?`<button class="btn pri" data-a="status" data-v="${next[0]}">${next[1]}</button>`:''}${fin?'':'<button class="btn" data-a="cancel">Batalkan pesanan</button>'}<button class="btn" data-a="rc">${A.rc===o.code?'Tutup struk':'Lihat struk'}</button></div>
 ${A.rc===o.code?receipt(o)+'<div class="acts"><button class="btn pri" data-a="print">Cetak struk</button></div>':''}`}
function vProducts(){const f=(id,l,t='text',x='')=>`<div class="fl">${l}<input id="${id}" type="${t}" ${x}></div>`;
 return `<div class="sum"><h1 class="l">Produk dan stok</h1><button class="btn pri" data-a="addt">${A.add?'Tutup':'Tambah produk'}</button></div>
 ${A.add?`<div class="box"><h2 class="l">Produk baru</h2>${f('np-name','Nama produk')}<div class="fl">Kategori<select id="np-cat"><option>gelang</option><option>kalung</option><option>cincin</option><option>anting</option></select></div>${f('np-price','Harga (Rp)','number','min=0 step=1000')}${f('np-mat','Bahan')}${f('np-desc','Deskripsi singkat')}${f('np-sw','Warna kartu','color','value="#c9a8b8"')}${f('np-col','Warna varian (pisahkan koma)','text','placeholder="Ruby, Rose Gold"')}${f('np-siz','Ukuran (opsional, pisahkan koma)','text','placeholder="14, 16, 18"')}${f('np-stk','Stok awal tiap varian','number','min=0 value=5')}<button class="btn pri" data-a="saveprod">Simpan produk</button></div>`:''}
 ${A.products.map(p=>`<div class="box"><div class="sum"><b>${esc(p.name)}</b><span>${rp(p.price)}</span></div><div class="vg">${p.variants.map(v=>`<label class="vi">${vl(v.color,v.size)}<input type="number" min="0" value="${v.stock}" data-a="stock" data-v="${v.id}"></label>`).join('')}</div></div>`).join('')}<p class="sub">Ubah angka stok lalu klik di luar kotak untuk menyimpan.</p>`}
function vReport(){const r=A.rep;return `<h1 class="l">Laporan penjualan</h1><div class="row"><div class="fl">Dari<input type="date" id="rf" value="${A.from}"></div><div class="fl">Sampai<input type="date" id="rt" value="${A.to}"></div><div class="fl">Kanal<select id="rch">${[['semua','Online dan offline'],['online','Online'],['offline','Offline']].map(([v,l])=>`<option value="${v}" ${A.ch===v?'selected':''}>${l}</option>`).join('')}</select></div><button class="btn pri" data-a="rep">Tampilkan</button></div>
 ${r?`<div class="stats"><div class="stat">Pendapatan<b>${rp(r.revenue)}</b></div><div class="stat">Transaksi<b>${r.count}</b></div><div class="stat">Item terjual<b>${r.items}</b></div></div>
 <h2 class="l">Produk terlaris</h2><div class="tw"><table><tr><th>Produk</th><th>Terjual</th><th>Pendapatan</th></tr>${r.top.map(t=>`<tr><td>${esc(t.name)}</td><td>${t.qty}</td><td>${rp(t.revenue)}</td></tr>`).join('')||'<tr><td colspan=3>Belum ada data.</td></tr>'}</table></div>
 <h2 class="l">Transaksi</h2><div class="tw"><table><tr><th>No.</th><th>Kanal</th><th>Tanggal</th><th>Bayar</th><th>Total</th></tr>${r.orders.map(o=>`<tr><td>${o.code}</td><td>${o.channel}</td><td>${fd(o.createdAt)}</td><td>${o.payment}</td><td>${rp(o.total)}</td></tr>`).join('')||'<tr><td colspan=5>Belum ada transaksi.</td></tr>'}</table></div>`:'<p class="sub">Pilih periode lalu klik Tampilkan.</p>'}`}
const upd=o=>{A.orders=A.orders.map(x=>x.code===o.code?o:x);drawA()};
async function actA(a,el){const o=A.orders.find(x=>x.code===A.sel),v=el.dataset.v;
 if(a==='tab'){A.tab=v;if(v==='products')A.products=await api('products');if(v==='orders')A.orders=await api('orders');if(v==='reports'&&!A.rep)A.rep=await api(`report?from=${A.from}&to=${A.to}&channel=${A.ch}`);return drawA()}
 if(a==='f'){A.f=v;return drawA()}if(a==='sel'){A.sel=v;A.rc=null;return drawA()}if(a==='rc'){A.rc=A.rc===o.code?null:o.code;return drawA()}if(a==='print')return printRc();
 if(a==='ship'){upd(await api(`orders/${o.id}/shipping`,'POST',{fee:+$('#ship').value}));return toast('Ongkir disimpan')}
 if(a==='verify'){upd(await api(`orders/${o.id}/verify`,'POST'));return toast('Pembayaran diverifikasi')}
 if(a==='status'){upd(await api(`orders/${o.id}/status`,'POST',{status:v}));return toast('Status diperbarui')}
 if(a==='cancel'){if(confirm('Batalkan pesanan '+o.code+'? Stok akan dikembalikan bila sudah dikurangi.'))upd(await api(`orders/${o.id}/status`,'POST',{status:'dibatalkan'}));return}
 if(a==='addt'){A.add=!A.add;return drawA()}
 if(a==='saveprod'){await api('products','POST',{name:$('#np-name').value,category:$('#np-cat').value,price:+$('#np-price').value,material:$('#np-mat').value,description:$('#np-desc').value,swatch:$('#np-sw').value,colors:$('#np-col').value,sizes:$('#np-siz').value,stock:+$('#np-stk').value});A.add=false;A.products=await api('products');drawA();return toast('Produk disimpan')}
 if(a==='rep'){A.from=$('#rf').value;A.to=$('#rt').value;A.ch=$('#rch').value;A.rep=await api(`report?from=${A.from}&to=${A.to}&channel=${A.ch}`);return drawA()}}

/* ---------- KASIR ---------- */
const K={products:[],q:'',bill:[],rc:null};
function drawK(){if(K.rc){app.innerHTML=`<div style="max-width:420px;margin:0 auto"><div class="hd"><div class="eb">Transaksi selesai</div><h1>${K.rc.code}</h1><div class="rule"></div></div>${receipt(K.rc)}<div class="acts"><button class="btn" data-a="print">Cetak struk</button><button class="btn pri" data-a="new">Transaksi baru</button></div></div>`;return}
 app.innerHTML=`<h1 class="l">Kasir</h1><div class="pos" style="margin-top:18px"><div><input id="q" class="srch" placeholder="Cari produk atau kategori" value="${esc(K.q)}"><div id="res"></div></div><aside class="box"><h2 class="l">Transaksi</h2><div id="bill"></div>
 <div class="fl">Pembayaran<select id="pay"><option value="tunai">Tunai</option><option value="transfer">Transfer</option></select></div><div class="fl" id="cashw">Uang diterima (Rp)<input id="cash" type="number" min="0"></div><div class="sum"><span>Kembalian</span><b id="chg">-</b></div><button class="btn pri" id="go" data-a="pay" style="width:100%">BAYAR</button></aside></div>`;resK();billK()}
function resK(){const q=K.q.toLowerCase(),l=K.products.filter(p=>!q||p.name.toLowerCase().includes(q)||p.category.includes(q));
 $('#res').innerHTML=l.map(p=>`<div class="pr"><div class="sum"><b>${esc(p.name)}</b><span>${rp(p.price)}</span></div>${p.variants.map(v=>`<button class="vb" data-a="add" data-p="${p.id}" data-v="${v.id}" ${v.stock?'':'disabled'}>${vl(v.color,v.size)} · ${v.stock?v.stock:'habis'}</button>`).join('')}</div>`).join('')||'<p class="sub">Produk tidak ditemukan.</p>'}
function billK(){const t=K.bill.reduce((s,i)=>s+i.price*i.qty,0),pay=$('#pay').value,cash=+$('#cash').value||0;
 $('#bill').innerHTML=(K.bill.map((i,x)=>`<div class="sum"><span>${esc(i.name)}<br><small>${vl(i.color,i.size)} · ${rp(i.price)}</small></span><span class="qty"><button data-a="q" data-x="${x}" data-d="-1">−</button>${i.qty}<button data-a="q" data-x="${x}" data-d="1">+</button></span></div>`).join('')||'<p class="sub">Belum ada item. Pilih varian di sebelah kiri.</p>')+`<div class="sum t"><span>Total</span><span>${rp(t)}</span></div>`;
 $('#cashw').style.display=pay==='tunai'?'':'none';$('#chg').textContent=pay==='tunai'&&t&&cash>=t?rp(cash-t):'-';$('#go').disabled=!(K.bill.length&&(pay==='transfer'||cash>=t))}
async function actK(a,el){const d=el.dataset;
 if(a==='print')return printRc();if(a==='new'){K.rc=null;return drawK()}
 if(a==='add'){const p=K.products.find(x=>x.id==d.p),v=p.variants.find(x=>x.id==d.v),ex=K.bill.find(i=>i.variantId==v.id);if((ex?ex.qty:0)+1>v.stock)return toast('Stok tidak cukup');
  ex?ex.qty++:K.bill.push({variantId:v.id,name:p.name,color:v.color,size:v.size,price:p.price,qty:1,max:v.stock});return billK()}
 if(a==='q'){const i=K.bill[+d.x],n=i.qty+ +d.d;if(n>i.max)return toast('Stok tidak cukup');n<1?K.bill.splice(+d.x,1):i.qty=n;return billK()}
 if(a==='pay'){const pay=$('#pay').value;K.rc=await api('pos','POST',{lines:K.bill.map(i=>({variantId:i.variantId,qty:i.qty})),pay,cash:pay==='tunai'?+$('#cash').value:null});K.bill=[];K.products=await api('products');drawK()}}

document.addEventListener('click',e=>{const el=e.target.closest('[data-a]');if(!el||el.tagName==='INPUT')return;run(()=>PAGE==='admin'?actA(el.dataset.a,el):actK(el.dataset.a,el))});
document.addEventListener('change',e=>{const el=e.target;if(el.dataset.a==='stock')run(async()=>{await api(`variants/${el.dataset.v}/stock`,'POST',{stock:+el.value});toast('Stok disimpan')});if(el.id==='pay')billK()});
document.addEventListener('input',e=>{if(e.target.id==='q'){K.q=e.target.value;resK()}if(e.target.id==='cash')billK()});
run(async()=>{if(PAGE==='admin'){A.orders=await api('orders');drawA()}else{K.products=await api('products');drawK()}});