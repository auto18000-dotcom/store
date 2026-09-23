(()=>{
  // Shown only when no destination is chosen: the places to start from. Choosing one reloads the Store for it.
  if(window.TourGuidDestination)return;
  const anchor=document.querySelector('.journey-shell');
  if(!anchor)return;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
  const hrefFor=d=>{const q=new URLSearchParams({destination:d.name});for(const [k,v] of [['region',d.region],['country',d.country],['countryCode',d.countryCode],['lat',d.lat],['lon',d.lon]])if(v!=null&&v!=='')q.set(k,v);return `./?${q}`};
  const photoFor=async(tile,art,credit,d)=>{
    try{
      const query=new URLSearchParams({destination:[d.name,d.country].filter(Boolean).join(', '),count:'1'});
      const response=await fetch(`/api/store/hero-photo?${query}`,{headers:{Accept:'application/json'}});
      if(!response.ok)return;
      const payload=await response.json();
      const photo=(Array.isArray(payload.photos)&&payload.photos[0])||payload;
      if(payload.source!=='pexels_api'||!photo?.image||!String(photo.image).startsWith('https://images.pexels.com/'))return;
      const img=new Image();
      img.onload=()=>{
        art.style.backgroundImage=`linear-gradient(180deg,rgba(4,46,55,0) 45%,rgba(4,46,55,.78) 100%),url("${photo.image}")`;
        tile.classList.add('has-photo');
        credit.href=photo.page||photo.photographerUrl||'https://www.pexels.com/';
        credit.textContent=`Photo: ${photo.photographer||'Pexels'}`;credit.hidden=false;
      };
      img.src=photo.image;
    }catch{}
  };
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
    for(const d of destinations){
      const tile=el('div','destination-tile');
      const link=el('a','destination-link');link.href=hrefFor(d);
      const art=el('div','destination-art');
      const label=el('div','destination-label');label.append(el('strong','',d.name),el('span','',[d.region,d.country].filter(Boolean).join(', ')));
      link.append(art,label);
      const credit=el('a','destination-credit');credit.hidden=true;credit.target='_blank';credit.rel='noopener';
      tile.append(link,credit);grid.append(tile);
      photoFor(tile,art,credit,d);
    }
    section.append(head,grid);
    anchor.after(section);
    // The gallery answers "nothing chosen yet", so the empty rows step aside.
    for(const id of ['hotels','activities','food','places'])document.getElementById(id)?.setAttribute('hidden','');
  })();
})();
