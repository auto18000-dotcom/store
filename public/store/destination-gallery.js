(()=>{
  // Shown only when no destination is chosen: the places to start from. Choosing one reloads the Store for it.
  if(window.TourGuidDestination)return;
  const anchor=document.querySelector('.journey-shell');
  if(!anchor)return;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
  const hrefFor=d=>{const q=new URLSearchParams({destination:d.name});for(const [k,v] of [['region',d.region],['country',d.country],['countryCode',d.countryCode],['lat',d.lat],['lon',d.lon]])if(v!=null&&v!=='')q.set(k,v);return `./?${q}`};
  const shade='linear-gradient(180deg,rgba(4,46,55,0) 45%,rgba(4,46,55,.78) 100%)';
  const okPhoto=p=>p&&p.image&&String(p.image).startsWith('https://images.pexels.com/');
  const fetchPhotos=async(query)=>{
    try{
      const response=await fetch(`/api/store/hero-photo?${new URLSearchParams(query)}`,{headers:{Accept:'application/json'}});
      if(!response.ok)return [];
      const payload=await response.json();
      if(payload.source!=='pexels_api')return [];
      return (Array.isArray(payload.photos)&&payload.photos.length?payload.photos:[payload]).filter(okPhoto);
    }catch{return []}
  };
  const preload=photo=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=photo.image});

  // Plain travel glyphs (not claims about any city's landmarks).
  const ICONS=[
    '<path d="M3 15l18-6-6 12-3-5-5-1z"/><path d="M12 16l9-7"/>',
    '<path d="M3 20l6-10 4 6 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>',
    '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8l1.5-3h5L16 8"/><circle cx="12" cy="14" r="3.2"/>',
    '<rect x="6" y="8" width="12" height="12" rx="2"/><path d="M9 8V5h6v3M10 12v4M14 12v4"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    '<path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2.5-5-6-5 0 3.5 2.5 5 6 5z"/>'
  ];
  const icon=i=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','tile-icon');svg.setAttribute('aria-hidden','true');svg.innerHTML=ICONS[i%ICONS.length];return svg};

  (async()=>{
    let destinations;
    try{
      const response=await fetch('/api/store/destinations',{headers:{Accept:'application/json'}});
      if(!response.ok)return;
      destinations=(await response.json()).destinations;
    }catch{return}
    if(!Array.isArray(destinations)||!destinations.length)return;

    const section=el('section','wrap destination-gallery');section.id='destination-gallery';
    const head=el('div','section-head');const copy=el('div');
    copy.append(el('div','kicker','Where to next'),el('h2','','Choose a destination'),el('p','','Pick a place to see current hotels, activities, food and landmarks, and to search flights there.'));
    head.append(copy);
    const grid=el('div','destination-grid');

    // The middle three positions hold the search box.
    const search=el('form','destination-search');search.setAttribute('role','search');
    const label=el('label','',null);label.htmlFor='gallery-search';label.append(el('span','destination-search-label','Where do you want to go?'));
    const input=el('input');input.id='gallery-search';input.type='search';input.placeholder='City, Region or Country';input.setAttribute('autocomplete','off');
    const note=el('div','destination-search-note');note.setAttribute('aria-live','polite');
    const field=el('div','destination-search-field');field.append(input);
    search.append(label,field,note);
    let picked=null;
    const go=place=>{location.href=hrefFor(place)};
    const state=window.TourGuidPlaces?.attach(input,{onChoose:place=>{picked=place;go({name:place.name,region:place.region,country:place.country,countryCode:place.countryCode,lat:place.lat,lon:place.lon})}});
    search.addEventListener('submit',async event=>{
      event.preventDefault();
      if(state?.place)return go(state.place);
      note.textContent='Finding it…';
      const {place,reason}=await window.TourGuidPlaces.resolveFirst(input.value);
      if(place)return go(place);
      note.textContent=reason==='offline'?'Place search is not connected yet.':reason==='short'?'Type at least two letters of a place.':reason==='none'?'No matching place found. Try another spelling.':'Place search is unavailable. Try again.';
    });
    grid.append(search);

    const tiles=[];
    for(const d of destinations.slice(0,12)){
      const tile=el('div','destination-tile');
      const flip=el('div','tile-flip');
      const front=el('div','tile-face tile-front');
      const art=el('div','destination-art');
      const labelBox=el('div','destination-label');labelBox.append(el('strong','',d.name),el('span','',[d.region,d.country].filter(Boolean).join(', ')));
      front.append(art,labelBox);
      const back=el('div','tile-face tile-back');
      flip.append(front,back);
      const link=el('a','destination-link');link.href=hrefFor(d);link.setAttribute('aria-label',`${d.name}, ${[d.region,d.country].filter(Boolean).join(', ')}`);
      const credit=el('a','destination-credit');credit.hidden=true;credit.target='_blank';credit.rel='noopener';
      tile.append(flip,link,credit);grid.append(tile);
      const record={d,tile,flip,front,back,credit,frontPhoto:null,flipped:false};
      tiles.push(record);
    }
    section.append(head,grid);
    anchor.after(section);
    // The gallery answers "nothing chosen yet", so the empty rows step aside.
    for(const id of ['hotels','activities','food','places'])document.getElementById(id)?.setAttribute('hidden','');

    const setCredit=(record,photo)=>{
      if(photo){record.credit.href=photo.page||photo.photographerUrl||'https://www.pexels.com/';record.credit.textContent=`Photo: ${photo.photographer||'Pexels'}`;record.credit.hidden=false}
      else record.credit.hidden=true;
    };
    // Each tile's own photo, all requests in parallel.
    tiles.forEach(async record=>{
      const [photo]=await fetchPhotos({destination:[record.d.name,record.d.country].filter(Boolean).join(', '),count:'1'});
      if(!photo||!(await preload(photo)))return;
      record.frontPhoto=photo;
      record.front.querySelector('.destination-art').style.backgroundImage=`${shade},url("${photo.image}")`;
      record.tile.classList.add('has-photo');
      if(!record.flipped)setCredit(record,photo);
    });

    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    // A little motion on arrival: a handful of tiles, chosen at random, turn over to show
    // a picture, a big name or a travel glyph, then turn back.
    const pool=await fetchPhotos({count:'12'});
    await Promise.all(pool.map(async photo=>{photo._ok=await preload(photo)}));
    const usable=pool.filter(p=>p._ok);
    const pick=a=>a[Math.floor(Math.random()*a.length)];
    const fillBack=record=>{
      record.back.replaceChildren();
      const kinds=['name','icon','name','icon'];if(usable.length)kinds.push('photo','photo');
      const kind=pick(kinds);let photo=null;
      const tint=pick(['orange','green','green','orange','deep']);
      record.back.className=`tile-face tile-back back-${kind} tint-${tint}`;
      if(kind==='photo'){photo=pick(usable);record.back.style.backgroundImage=`${shade},url("${photo.image}")`;record.back.append(el('strong','tile-back-name',record.d.name))}
      else{record.back.style.backgroundImage='';
        if(kind==='name')record.back.append(el('strong','tile-back-name',record.d.name));
        else{record.back.append(icon(Math.floor(Math.random()*ICONS.length)),el('span','tile-back-small',record.d.name))}}
      return photo;
    };
    const turn=(record,hold)=>{
      if(record.flipped||record.hovered)return;
      const photo=fillBack(record);
      record.flipped=true;record.tile.classList.add('is-flipped');setCredit(record,photo);
      // hold === null: this one stays turned over, part of the patchwork the ripples leave behind.
      if(hold===null)return;
      setTimeout(()=>{record.flipped=false;record.tile.classList.remove('is-flipped');setCredit(record,record.frontPhoto)},hold);
    };
    tiles.forEach(r=>{r.tile.addEventListener('mouseenter',()=>{r.hovered=true});r.tile.addEventListener('mouseleave',()=>{r.hovered=false});r.tile.addEventListener('focusin',()=>{r.hovered=true});r.tile.addEventListener('focusout',()=>{r.hovered=false})});
    // A splash: pick a tile, and a wave of flips spreads out from it. The further a tile is
    // from the splash, the later it turns and the less likely it is to turn at all, so the
    // ripple thins out and dies down. Several splashes, each from somewhere new.
    const ripple=()=>{
      const centres=tiles.map(r=>{const b=r.tile.getBoundingClientRect();return {r,x:b.left+b.width/2,y:b.top+b.height/2}});
      const origin=pick(centres);
      const dist=centres.map(c=>Math.hypot(c.x-origin.x,c.y-origin.y));
      const far=Math.max(...dist)||1;
      centres.forEach((c,i)=>{
        const d=dist[i]/far;
        if(i>0&&centres[i]!==origin&&Math.random()>1-d*0.8)return;
        setTimeout(()=>turn(c.r,Math.random()<0.3?null:900+Math.random()*700),d*700);
      });
    };
    [0,1400].forEach(delay=>setTimeout(ripple,300+delay));
  })();
})();
