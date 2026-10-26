/* Semua akses data lewat file ini. Terhubung ke Laravel (/api/...). */
const rp=n=>'Rp '+Math.round(n).toLocaleString('id-ID');
async function http(url,opt={}){const r=await fetch('/api'+url,{headers:{'Content-Type':'application/json','Accept':'application/json'},...opt});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'Terjadi kesalahan');return d}
let PRODUCTS=[],LOADED=false,ORD={};try{ORD=JSON.parse(sessionStorage.getItem('sv-orders'))||{}}catch(e){}
const keep=o=>{ORD[o.code]=o;try{sessionStorage.setItem('sv-orders',JSON.stringify(ORD))}catch(e){}};
const API={
 async load(force){if(LOADED&&!force)return;PRODUCTS=await http('/products');LOADED=true},
 getProducts:cat=>PRODUCTS.filter(p=>!cat||cat==='semua'||p.category===cat),
 getProduct:id=>PRODUCTS.find(p=>String(p.id)===String(id)),
 findVariant(id){for(const p of PRODUCTS){const v=p.variants.find(v=>String(v.id)===String(id));if(v)return{p,v}}},
 async createOrder(f,lines){const o=await http('/orders',{method:'POST',body:JSON.stringify({...f,lines})});keep(o);await API.load(true);return o},
 async lookupOrder(code,tel){try{const o=await http('/orders/lookup',{method:'POST',body:JSON.stringify({code,phone:tel})});keep(o);return o}catch(e){return null}},
 getOrder:code=>ORD[code]};
