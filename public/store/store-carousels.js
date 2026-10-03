(async()=>{
  const context=new URLSearchParams(location.search);
  // window.TourGuidDestination (set by index.html before this script loads)
  // carries the FULL chosen place -- region/country/lat/lon, not just a name.
  // A bare name is a guess handed to a geocoder (two different cities can
  // share one name in different countries), so pages without that context fall
  // back to reading the same fields from the URL query instead of a name alone.
  const destinationCtx=window.TourGuidDestination||(context.get('destination')?{
    name:context.get('destination'),
    region:context.get('region')||null,
    country:context.get('country')||null,
    countryCode:context.get('countryCode')||null,
    lat:context.get('lat')?Number(context.get('lat')):null,
    lon:context.get('lon')?Number(context.get('lon')):null,
  }:null);
  // No destination chosen: no live request (the feed refuses one), just the
  // destination-neutral editorial theme cards.
  const destination=destinationCtx?destinationCtx.name:null;
  const forwardKeys=['destination','region','country','countryCode','lat','lon','from','to'];
  // The extensionless form, never '<page>.html': this local server (and
  // Cloudflare's own default asset handling) redirects the .html filename to
  // its clean-URL equivalent, and that redirect drops the query string
  // entirely -- silently discarding the whole destination context on every
  // single cross-page click. Confirmed live: navigating straight to
  // hotels.html?destination=Lisbon lands on /store/hotels with no query at
  // all, which is why a chosen destination silently reset to the default even
  // though every handler here reads the destination correctly.
  const categoryHref=page=>{const url=new URL(`./${page.replace(/\.html$/,'')}`,location.href);for(const key of forwardKeys)if(context.has(key))url.searchParams.set(key,context.get(key));return `${url.pathname.split('/').pop()}${url.search?url.search:''}`};
  const categories={
    hotels:{page:'hotels.html',name:'Hotels',type:'Hotel',description:'Browse stays, compare neighborhoods, and open hotel details.',themes:[
      ['Waterfront stays','Find a base close to the coast and open spaces.','visual-water'],
      ['Central city stays','Explore hotels near major sights and transit.','visual-city'],
      ['Family stays','Compare location and room needs for a shared trip.','visual-hotel'],
      ['Design and boutique stays','Browse smaller properties with a distinct setting.','visual-city']
    ]},
    activities:{page:'activities.html',name:'Experiences',type:'Activity',description:'Explore activities by interest, timing, and meeting point.',themes:[
      ['Food and culture','Explore guided tastings and local traditions.','visual-food'],
      ['Art and museums','Make space for galleries, collections, and exhibits.','visual-city'],
      ['Walking experiences','Find a route that fits the pace of the day.','visual-activity'],
      ['Outdoor experiences','Browse activities shaped by the destination.','visual-water']
    ]},
    food:{page:'food.html',name:'Food experiences',type:'Food experience',description:'Explore dining, tastings, and restaurant planning.',themes:[
      ['Markets and tastings','Explore food markets and tasting experiences.','visual-food'],
      ['Dinner near your stay','Plan a meal around your hotel and daily route.','visual-city'],
      ['Local food walks','Browse food-focused neighborhood experiences.','visual-activity'],
      ['Restaurant discovery','Find dining ideas to check with the provider.','visual-food']
    ]},
    places:{page:'places.html',name:'Places',type:'Place',description:'Browse sights and neighborhoods to shape each Journey day.',themes:[
      ['Historic neighborhoods','Explore streets, squares, and city stories.','visual-city'],
      ['Parks and viewpoints','Build room for open space and city views.','visual-water'],
      ['Arts and architecture','Collect landmarks for a day of discovery.','visual-place'],
      ['Nearby discoveries','Find places that fit around your hotel and route.','visual-city']
    ]}
  };

  // One request PER ROW, all in parallel: a fast row (hotels, places) fills the moment
  // it is ready instead of waiting for the slowest provider, and each row shows a
  // placeholder while it loads. A missing/failed/slow answer is not an error state --
  // that row keeps its editorial theme cards, which are honest on their own.
  const fetchCategory=async id=>{
    if(!destinationCtx)return null;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const feedParams=new URLSearchParams({destination,categories:id});
      for(const [key,val] of [['region',destinationCtx.region],['country',destinationCtx.country],['lat',destinationCtx.lat],['lon',destinationCtx.lon]])if(val!=null&&val!=='')feedParams.set(key,val);
      const response=await fetch(`/api/store/feed?${feedParams}`,{signal:controller.signal,headers:{Accept:'application/json'}});
      return response.ok?(await response.json())?.categories?.[id]||null:null;
    }catch{return null}finally{clearTimeout(timeout)}
  };

  const money=(amount,currency)=>{try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD'}).format(amount)}catch{return `${currency||''} ${amount}`.trim()}};

  const buildThemeCard=(config,[title,summary,visualClass],categoryHref)=>{
    const card=document.createElement('a');card.className='carousel-theme-card';card.href=categoryHref;
    const visual=document.createElement('div');visual.className=`card-visual ${visualClass}`;
    const caption=document.createElement('span');caption.textContent='Explore a theme';visual.append(caption);
    const body=document.createElement('div');body.className='card-body';
    const type=document.createElement('div');type.className='tag';type.textContent=config.name;
    const name=document.createElement('h3');name.textContent=title;
    const copy=document.createElement('p');copy.textContent=summary;
    const linkText=document.createElement('span');linkText.className='theme-action';linkText.textContent=`Explore ${config.name.toLowerCase()} →`;
    body.append(type,name,copy,linkText);card.append(visual,body);
    return card;
  };

  const buildProductCard=(config,item)=>{
    const card=document.createElement('a');
    card.className='carousel-theme-card carousel-product-card';
    // A supplier's address is never put on the page as it arrived: TourGuidSupplier sends it through /api/store/go (and,
    // for a bookable item with the sheet on, through the handoff sheet first). With no safe address the card keeps
    // pointing at its category page, as before. A hotel never takes this path: it opens its own page, below.
    const hotelPage=item.category==='hotels'&&item.id;
    if(!hotelPage&&!window.TourGuidSupplier?.bind(card,item.url,{bookable:!!item.bookable,title:item.title,type:config.type})){card.href=categoryHref(config.page);card.target='_blank';card.rel='noopener'}
    // A hotel opens its own page here (photos, reviews, map, contact and, with dates, its price), not Google Maps. Extensionless: a .html redirect drops the query.
    if(hotelPage){
      const q=new URLSearchParams({placeId:item.id});
      if(destination)q.set('destination',destination);
      if(destinationCtx){for(const key of ['region','country','countryCode','lat','lon'])if(destinationCtx[key]!=null&&destinationCtx[key]!=='')q.set(key,destinationCtx[key])}
      for(const key of ['from','to','adults'])if(context.get(key))q.set(key,context.get(key));
      q.set('name',item.title||'');
      card.href=`hotel?${q}`;card.removeAttribute('target');card.removeAttribute('rel');
    }
    const visual=document.createElement('div');visual.className='card-visual product-photo';
    if(item.photo)visual.style.backgroundImage=`url("${item.photo}")`;
    // Google's Places terms require the photographer's attribution to travel
    // with the image -- this is not optional decoration.
    if(item.photoCredit){
      const credit=document.createElement('span');credit.className='photo-credit';
      credit.textContent=`Photo: ${item.photoCredit}`;
      visual.append(credit);
    }
    const body=document.createElement('div');body.className='card-body';
    const sourceTag=document.createElement('div');sourceTag.className=/google/i.test(item.source||'')?'tag tag-tiny':'tag';
    sourceTag.textContent=item.type?`${item.source||config.name} · ${item.type}`:(item.source||config.name);
    const name=document.createElement('h3');name.textContent=item.title;
    const copy=document.createElement('p');copy.textContent=item.summary||'';
    const meta=document.createElement('div');meta.className='product-meta';
    if(typeof item.rating==='number'){
      const rating=document.createElement('span');rating.className='product-rating';
      const sources=Array.isArray(item.reviewSources)?item.reviewSources:null;
      // rating/reviewCount are a COMBINED figure across review sources -- naming
      // just the booking source (the tag above) beside a blended count would
      // attribute strangers' reviews from other platforms to that one name.
      const combined=sources&&sources.length>1;
      rating.textContent=`★ ${item.rating.toFixed(1)}${item.reviewCount?` (${item.reviewCount.toLocaleString()}${combined?' combined':''})`:''}`;
      if(combined)rating.title=sources.map(s=>`${s.provider} ${s.rating.toFixed(1)} (${s.count.toLocaleString()})`).join(' · ');
      meta.append(rating);
    }
    if(item.durationMinutes){
      const duration=document.createElement('span');duration.className='product-duration';
      duration.textContent=item.durationMinutes>=60?`${Math.round(item.durationMinutes/60*10)/10} hr`:`${item.durationMinutes} min`;
      meta.append(duration);
    }
    if(item.instantConfirmation){
      const instant=document.createElement('span');instant.className='product-instant';
      instant.textContent='Confirms instantly';
      meta.append(instant);
    }
    // bookable=false must look different from bookable=true: a Google listing
    // has no price and no purchase action, only a place to look. Showing a
    // price on an unpriced listing is exactly the failure mode to avoid.
    if(item.bookable&&typeof item.price==='number'){
      const price=document.createElement('span');price.className='product-price';
      price.textContent=`from ${money(item.price,item.currency)}`;
      meta.append(price);
    }
    const action=document.createElement('span');action.className='theme-action';
    action.textContent=item.bookable?`Book on ${item.source} →`:'View details →';
    body.append(sourceTag,name,copy,meta,action);
    card.append(visual,body);
    return card;
  };

  for(const [sectionId,config] of Object.entries(categories)){
    const section=document.getElementById(sectionId);
    const track=section?.querySelector(':scope > .grid');
    if(!track)continue;
    // Captured before any manipulation: the hand-written editorial cards
    // that shipped in the page's own HTML. When live data exists for this
    // row, they're the failure mode the owner actually hit -- a real hotel
    // sitting behind eight editorial cards, reachable only by clicking past
    // all of them. Live results must lead the row, not follow it.
    const originalCards=[...track.children];
    if(!destinationCtx){
      // Nothing has been asked of any provider yet, so theme cards would be
      // filler: say what the page needs instead.
      originalCards.forEach(el=>el.remove());
      const prompt=document.createElement('div');prompt.className='choose-destination-prompt';
      const text=document.createElement('p');text.textContent="Choose a destination to see what's available";
      const go=document.createElement('button');go.type='button';go.textContent='Search a place';
      go.addEventListener('click',()=>{const field=document.getElementById('search-place');field?.scrollIntoView({behavior:'smooth',block:'center'});field?.focus()});
      prompt.append(text,go);track.replaceWith(prompt);
      const link=section.querySelector('.section-head > a');if(link){link.href=categoryHref(config.page);link.textContent=`Browse all ${config.name.toLowerCase()} →`;link.removeAttribute('target');link.removeAttribute('rel')}
      continue;
    }
    section.classList.add('store-carousel');
    track.classList.add('carousel-track');
    track.setAttribute('aria-label',`${config.name} carousel`);
    track.tabIndex=0;
    const headerLink=section.querySelector('.section-head > a');
    if(headerLink){headerLink.href=categoryHref(config.page);headerLink.textContent=`Browse all ${config.name.toLowerCase()} →`;headerLink.removeAttribute('target');headerLink.removeAttribute('rel')}
    else{const browse=document.createElement('a');browse.href=categoryHref(config.page);browse.textContent=`Browse all ${config.name.toLowerCase()} →`;section.querySelector('.section-head')?.append(browse)}

    const category=document.createElement('a');
    category.className='carousel-category-card';
    category.href=categoryHref(config.page);
    const categoryVisual=document.createElement('div');
    categoryVisual.className='card-visual';
    const visualText=document.createElement('span');visualText.textContent=`Explore ${config.name}`;
    categoryVisual.append(visualText);
    const categoryBody=document.createElement('div');categoryBody.className='card-body';
    const tag=document.createElement('div');tag.className='tag';tag.textContent='Full collection';
    const heading=document.createElement('h3');heading.textContent=`View all ${config.name.toLowerCase()}`;
    const description=document.createElement('p');description.textContent=config.description;
    const action=document.createElement('span');action.className='category-action';action.textContent=`Open ${config.name} page →`;
    categoryBody.append(tag,heading,description,action);
    category.append(categoryVisual,categoryBody);

    originalCards.forEach(el=>el.remove());
    for(let i=0;i<3;i++){const sk=document.createElement('div');sk.className='carousel-skeleton';sk.setAttribute('aria-hidden','true');track.append(sk)}

    const controls=document.createElement('div');controls.className='carousel-controls';
    const count=document.createElement('span');count.className='carousel-count';count.setAttribute('aria-live','polite');
    const previous=document.createElement('button');previous.className='carousel-arrow';previous.type='button';previous.textContent='‹';previous.setAttribute('aria-label',`Previous ${config.name.toLowerCase()}`);
    const next=document.createElement('button');next.className='carousel-arrow';next.type='button';next.textContent='›';next.setAttribute('aria-label',`Next ${config.name.toLowerCase()}`);
    controls.append(count,previous,next);track.before(controls);
    const update=()=>{const step=track.children[0].getBoundingClientRect().width+19;const visible=window.matchMedia('(max-width:620px)').matches?1:window.matchMedia('(max-width:900px)').matches?2:3;const start=Math.min(track.children.length-visible,Math.max(0,Math.round(track.scrollLeft/step)));count.textContent=`${start+1}–${Math.min(start+visible,track.children.length)} of ${track.children.length}`;previous.disabled=start===0;next.disabled=start+visible>=track.children.length};
    const move=direction=>{const step=track.children[0].getBoundingClientRect().width+19;track.scrollBy({left:direction*step,behavior:'smooth'})};
    previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);
    const fillRow=live=>{
      track.replaceChildren();track.scrollLeft=0;
    if(live?.live&&Array.isArray(live.items)&&live.items.length){
      // Live results lead the row. The page's own hand-written editorial
      // cards are removed entirely rather than pushed behind real results --
      // a hotel that's real shouldn't sit eight clicks past ones that aren't.
      // Same shape as the editorial row: two leading cards, the "View all"
      // card, then the rest. Here the two leading cards are the searched
      // city's first live results.
      live.items.slice(0,2).forEach(item=>track.append(buildProductCard(config,item)));
      track.append(category);
      live.items.slice(2).forEach(item=>track.append(buildProductCard(config,item)));
    }else{
      config.themes.slice(0,2).forEach(theme=>track.append(buildThemeCard(config,theme,categoryHref(config.page))));
      track.append(category);
      config.themes.slice(2).forEach(theme=>track.append(buildThemeCard(config,theme,categoryHref(config.page))));
    }

      update();
    };
    update();
    fetchCategory(sectionId).then(fillRow);
  }
})();
