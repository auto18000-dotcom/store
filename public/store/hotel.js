(()=>{
  // ONE HOTEL, IN FULL. Reached from a hotel card on the landing carousel (?placeId=, a Google place) or on the Hotels page (?id=, a price-provider stay).
  // It joins the two by name: the price provider knows dates, guests and prices; Google knows photos, reviews, phone and website. Each is labelled with its own source
  // and the two scores are NEVER merged (the price provider's is out of ten, Google's out of five).
  //
  // WHAT THIS PAGE MUST NEVER DO
  //  * show a review without its author linked to their Google page, or a photo without its photographer (Google's terms; both come with the data and are printed with it);
  //  * show a price as if it were real while the provider is in test mode: the banner and the mark on the figure both read liveMode, exactly as on the Hotels page;
  //  * offer to book: there is no booking button, only a link to the hotel's own site;
  //  * invent anything: a section with no data is left out, not filled.
  const {el,priceBlock,banner,money,plural,rangeText,occupancyText,score,isDate}=window.TourGuidHotelParts;
  const params=new URLSearchParams(location.search);
  const main=document.getElementById('hd');
  const KEYS=['destination','region','country','countryCode','lat','lon'];
  const from=isDate(params.get('from'))?params.get('from'):isDate(params.get('checkIn'))?params.get('checkIn'):'';
  const to=isDate(params.get('to'))?params.get('to'):isDate(params.get('checkOut'))?params.get('checkOut'):'';
  const dated=!!(from&&to&&to>from);
  const adults=Math.min(12,Math.max(1,Number(params.get('adults'))||2));
  const safe=url=>{try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}};
  const number=v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v));

  const getJSON=async(url,ms=25000)=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
    try{const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});return response.ok?await response.json():null}catch{return null}finally{clearTimeout(timer)}
  };
  const norm=name=>String(name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\b(hotel|the|by|de|la|el|a|hoteles)\b/g,' ').replace(/\s+/g,' ').trim();
  const sameHotel=(a,b)=>{
    const x=norm(a),y=norm(b);if(!x||!y)return false;
    if(x===y||x.includes(y)||y.includes(x))return true;
    const s=new Set(x.split(' ')),t=new Set(y.split(' '));let both=0;for(const w of s)if(t.has(w))both++;
    return both/Math.max(1,Math.min(s.size,t.size))>=0.75&&both>=2;
  };
  const ctxQuery=()=>{const q=new URLSearchParams();for(const key of KEYS)if(params.get(key))q.set(key,params.get(key));return q};
  const staysUrl=(lat,lon)=>{const q=ctxQuery();if(lat!=null&&lon!=null&&!(number(params.get('lat'))&&number(params.get('lon')))){q.set('lat',lat);q.set('lon',lon)}if(dated){q.set('checkIn',from);q.set('checkOut',to)}q.set('adults',String(adults));return `/api/store/hotels?${q}`};

  const stars=n=>Number.isFinite(n)&&n>0?el('span',{class:'hd-stars','aria-label':`${n}-star hotel`},'★'.repeat(Math.min(5,Math.round(n)))):null;
  const credit=(text,url)=>{const link=safe(url);return el('span',{class:'hd-credit'},'Photo: ',link?el('a',{href:link,target:'_blank',rel:'noopener noreferrer'},text||'Google contributor'):(text||'Google contributor'))};

  // ---------------------------------------------------------- the pieces
  const gallery=photos=>{
    if(!photos.length)return el('div',{class:'hd-nophoto'},'No photo is available for this hotel.');
    const wrap=el('div',{class:'hd-gallery'});
    const stage=el('figure',{class:'hd-stage'});const img=el('img',{alt:'',referrerpolicy:'no-referrer'});const cap=el('figcaption',{});
    stage.append(img,cap);
    const show=i=>{const p=photos[i];img.src=p.url;img.alt=`Photo ${i+1} of ${photos.length}`;cap.replaceChildren(p.credit||p.creditUrl?credit(p.credit,p.creditUrl):`Photo ${i+1} of ${photos.length}`);thumbs.forEach((t,j)=>t.setAttribute('aria-current',j===i?'true':'false'))};
    const thumbs=photos.map((p,i)=>{const b=el('button',{type:'button',class:'hd-thumb','aria-label':`Show photo ${i+1}`},el('img',{src:p.url,alt:'',loading:'lazy',referrerpolicy:'no-referrer'}));b.addEventListener('click',()=>show(i));return b});
    wrap.append(stage);if(photos.length>1)wrap.append(el('div',{class:'hd-thumbs'},thumbs));
    show(0);return wrap;
  };

  const tile=(lat,lon,z)=>{const n=2**z;return{x:((lon+180)/360)*n,y:((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2)*n}};
  const map=(lat,lon)=>{
    const z=16,c=tile(lat,lon,z),tx=Math.floor(c.x),ty=Math.floor(c.y);
    const box=el('div',{class:'hd-map',role:'img','aria-label':'Map of the hotel'});const grid=el('div',{class:'hd-map-grid'});
    // 3 x 3 tiles of 256px, the middle one holding the point; the grid is moved so the point sits at the centre of the box.
    grid.style.transform=`translate(calc(-50% - ${((c.x-tx-0.5)*256).toFixed(1)}px - 0px), calc(-50% - ${((c.y-ty-0.5)*256).toFixed(1)}px))`;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const sub=['a','b','c'][(dx+dy+2)%3];grid.append(el('img',{src:`https://${sub}.tile.openstreetmap.org/${z}/${tx+dx}/${ty+dy}.png`,alt:'',width:'256',height:'256',loading:'lazy',referrerpolicy:'no-referrer'}))}
    box.append(grid,el('span',{class:'hd-pin','aria-hidden':'true'}),el('span',{class:'hd-osm'},'© OpenStreetMap contributors'));
    return box;
  };

  const review=r=>{
    const link=safe(r.authorUrl);
    const who=el('div',{class:'hd-who'},r.authorPhoto&&safe(r.authorPhoto)?el('img',{src:r.authorPhoto,alt:'',referrerpolicy:'no-referrer'}):null,
      el('div',{},link?el('a',{href:link,target:'_blank',rel:'noopener noreferrer'},r.author||'Google reviewer'):el('b',{},r.author||'Google reviewer'),
        el('small',{},[Number.isFinite(r.rating)?`${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5-Math.round(r.rating))} ${r.rating} out of 5`:'',r.publishedAt?new Date(r.publishedAt).toLocaleDateString('en-US',{year:'numeric',month:'short'}):''].filter(Boolean).join(' · '))));
    return el('article',{class:'hd-review'},who,r.text?el('p',{},r.text):null);
  };

  // ---------------------------------------------------------- the page
  const section=(title,...kids)=>el('section',{class:'hd-sec'},el('h2',{},title),...kids.flat());
  const render=({stay,place,liveMode,pricedFor})=>{
    const name=(place&&place.name)||(stay&&stay.name)||params.get('name')||'Hotel';
    document.title=`${name} | TourGuid Travel Store`;
    const city=params.get('destination')||(stay&&stay.city)||'';
    const back=new URLSearchParams();for(const key of KEYS)if(params.get(key))back.set(key,params.get(key));if(from&&to){back.set('from',from);back.set('to',to)}back.set('adults',String(adults));
    const backHref=`hotels?${back}`;
    document.getElementById('hd-back-foot').href=backHref;
    const address=(place&&place.address)||[stay&&stay.address,stay&&stay.city,stay&&stay.country].filter(Boolean).join(', ');
    const lat=place&&place.lat!=null?place.lat:stay&&stay.lat,lon=place&&place.lon!=null?place.lon:stay&&stay.lon;
    const photos=(place&&place.photos&&place.photos.length?place.photos.map(p=>({url:p.url,credit:p.credit,creditUrl:p.creditUrl})):stay&&stay.photo?[{url:stay.photo}]:[]);

    const head=el('header',{class:'hd-head'},
      el('nav',{class:'hd-crumb','aria-label':'Breadcrumb'},el('a',{href:'index.html'},'Travel Store'),' / ',el('a',{href:backHref},city?`Hotels in ${city}`:'Hotels'),' / ',name),
      el('h1',{},name,' ',stars(stay&&stay.stars)),
      address?el('p',{class:'hd-addr'},address):null,
      el('div',{class:'hd-scores'},
        stay&&typeof stay.guestScoreOutOfTen==='number'?el('div',{class:'hd-score'},el('b',{},score(stay.guestScoreOutOfTen)),el('span',{},el('strong',{},'out of 10'),Number.isFinite(stay.reviewCount)&&stay.reviewCount>0?` from ${stay.reviewCount.toLocaleString('en-US')} reviews`:'',el('small',{},'Guest score from our price provider'))):null,
        place&&typeof place.rating==='number'?el('div',{class:'hd-score g'},el('b',{},place.rating.toFixed(1)),el('span',{},el('strong',{},'out of 5'),place.reviewCount?` from ${place.reviewCount.toLocaleString('en-US')} reviews`:'',el('small',{},'Google reviews'))):null));

    // the price panel: the same block as the Hotels page, in the same states
    const priced=stay&&stay.price&&Number.isFinite(stay.price.total);
    const panel=el('aside',{class:'hd-panel','aria-label':'Your stay'},el('h2',{},'Your stay'));
    const form=el('form',{class:'hd-form',action:'hotel',method:'get'});
    for(const key of ['id','placeId',...KEYS,'name'])if(params.get(key))form.append(el('input',{type:'hidden',name:key,value:params.get(key)}));
    const ci=el('input',{type:'date',id:'hd-in',name:'from',value:from,min:new Date().toISOString().slice(0,10)});
    const co=el('input',{type:'date',id:'hd-out',name:'to',value:to});
    const ad=el('input',{type:'number',id:'hd-adults',name:'adults',min:'1',max:'12',value:String(adults)});
    form.append(el('div',{class:'hs-field'},el('label',{for:'hd-in'},'Check-in'),ci),el('div',{class:'hs-field'},el('label',{for:'hd-out'},'Check-out'),co),el('div',{class:'hs-field narrow'},el('label',{for:'hd-adults'},'Adults'),ad),el('button',{class:'btn primary',type:'submit'},'Show prices'));
    panel.append(form);
    if(stay){
      if(priced&&liveMode!==true)panel.append(banner(liveMode===false?false:null));
      panel.append(priceBlock(stay,{liveMode,dated},()=>{ci.focus();try{ci.showPicker?.()}catch{}}));
      if(priced&&pricedFor)panel.append(el('p',{class:'hd-fine'},`Priced for ${occupancyText(pricedFor.occupancy)||'the guests shown'}, ${pricedFor.checkIn&&pricedFor.checkOut?rangeText(pricedFor.checkIn,pricedFor.checkOut):'these dates'}, in ${pricedFor.currency||'the currency shown'}. The price is the total for the stay.`));
    }else{
      panel.append(el('div',{class:'hs-price na'},el('b',{},'No price for this hotel'),el('p',{},'TourGuid shows prices only for hotels from our price provider, and this one is not on it for this search.')));
    }
    const site=place&&safe(place.website),maps=(place&&safe(place.url))||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name,address].filter(Boolean).join(', '))}`;
    panel.append(el('div',{class:'hd-where'},el('p',{},"TourGuid shows prices only. Check availability on the hotel's own site."),
      site?el('a',{href:site,target:'_blank',rel:'noopener noreferrer'},"Hotel's own site ↗"):null,
      el('a',{href:maps,target:'_blank',rel:'noopener noreferrer'},'View on a map ↗')));

    const left=el('div',{class:'hd-left'});
    if(place&&place.summary)left.append(section('About this hotel',el('p',{},place.summary)));
    const reviews=place&&place.reviews?place.reviews.filter(r=>r&&r.text):[];
    if(reviews.length)left.append(section('What guests say',el('p',{class:'hd-src'},`Google reviews. Showing ${reviews.length} of ${place.reviewCount?place.reviewCount.toLocaleString('en-US'):'many'}.`),reviews.map(review)));
    if(Number.isFinite(lat)&&Number.isFinite(lon))left.append(section('Location',map(lat,lon),address?el('p',{class:'hd-addr'},address):null));
    const contact=[];
    if(place&&place.phone)contact.push(el('li',{},el('b',{},'Phone'),el('a',{href:`tel:${place.phone.replace(/[^+\d]/g,'')}`},place.phone)));
    if(site)contact.push(el('li',{},el('b',{},'Website'),el('a',{href:site,target:'_blank',rel:'noopener noreferrer'},'Hotel’s own site ↗')));
    if(stay&&stay.chain)contact.push(el('li',{},el('b',{},'Chain'),stay.chain));
    if(place&&place.openingHours&&place.openingHours.length)contact.push(el('li',{},el('b',{},'Hours'),el('span',{},place.openingHours.join(' · '))));
    if(contact.length)left.append(section('Contact',el('ul',{class:'hd-contact'},contact)));
    left.append(el('p',{class:'hd-fine'},[place?'Photos, reviews, phone and website are from Google Places. ':'',stay?'Guest score, class and prices are from our price provider. ':'','Confirm price and terms with the hotel.'].join('')));

    main.replaceChildren(head,el('div',{class:'hd-top'},el('div',{class:'hd-main'},gallery(photos),left),panel));
  };

  // ---------------------------------------------------------- load
  (async()=>{
    const placeId=params.get('placeId'),id=params.get('id');
    if(!placeId&&!id){main.replaceChildren(el('p',{class:'hd-status'},'This hotel page needs a hotel. Choose one from the hotels list.'),el('a',{href:'hotels.html'},'Back to hotels'));return}
    let stay=null,place=null,liveMode=null,pricedFor=null;
    const findStay=async(lat,lon,match)=>{
      const answer=await getJSON(staysUrl(lat,lon),28000);
      if(!answer||!Array.isArray(answer.stays))return;
      const found=answer.stays.find(match);
      if(found){stay=found;liveMode=answer.liveMode===true?true:answer.liveMode===false?false:null;pricedFor=answer.pricedFor||null}
    };
    if(placeId){
      const d=await getJSON(`/api/store/detail?placeId=${encodeURIComponent(placeId)}`);
      place=d&&d.place||null;
      if(!place){main.replaceChildren(el('p',{class:'hd-status'},'This hotel could not be loaded just now.'),el('a',{href:'hotels.html'},'Back to hotels'));return}
      render({stay,place,liveMode,pricedFor});
      await findStay(place.lat,place.lon,s=>sameHotel(s.name,place.name));
      render({stay,place,liveMode,pricedFor});
    }else{
      main.replaceChildren(el('p',{class:'hd-status',role:'status'},dated?'Loading the hotel and its price. This can take about ten seconds…':'Loading the hotel…'));
      await findStay(null,null,s=>String(s.id)===String(id));
      if(!stay){main.replaceChildren(el('p',{class:'hd-status'},'This hotel is not in the list for this search any more.'),el('a',{href:`hotels?${ctxQuery()}`},'Back to hotels'));return}
      render({stay,place,liveMode,pricedFor});
      // Google's own page for the same hotel, found by its name in the same city's Google list.
      const q=ctxQuery();q.set('categories','hotels');
      const feed=await getJSON(`/api/store/feed?${q}`);
      const items=feed&&feed.categories&&feed.categories.hotels&&Array.isArray(feed.categories.hotels.items)?feed.categories.hotels.items:[];
      const hit=items.find(i=>i&&i.id&&sameHotel(i.title,stay.name));
      if(hit){const d=await getJSON(`/api/store/detail?placeId=${encodeURIComponent(hit.id)}`);place=d&&d.place||null;if(place)render({stay,place,liveMode,pricedFor})}
    }
  })();
})();
