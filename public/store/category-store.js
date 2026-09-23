(async()=>{
  const category=location.pathname.split('/').pop().replace('.html','');
  const provider={
    hotels:{name:'Hotels',supplier:'TourGuid',url:'',intro:'Explore places to stay by location, style, and the way they fit your Journey.',rows:[
      {title:'Featured stays',hint:'Start with a property or a stay style.',items:[['Waterfront stays','Keep the coast and open space close to your stay.'],['City center stays','Look for a base near major sights and transport.'],['Boutique stays','Explore smaller hotels with a distinct setting.'],['Family stays','Compare room arrangements and neighborhood access.']]},
      {title:'Explore neighborhoods',hint:'Choose a base that works for the day plan.',items:[['Waterfront districts','Plan for coastal walks and dining nearby.'],['Historic center','Keep older streets and city landmarks within reach.'],['Shopping districts','Explore a stay close to shopping and transit.'],['Near transit','Consider how easy it is to reach each day’s stops.'],['Quieter areas','Explore a slower base beyond the busiest blocks.']]},
      {title:'Match your Journey',hint:'Compare hotels by what matters to your trip.',items:[['Walkable days','Shorten travel between your hotel and activities.'],['Food-focused stays','Plan dinner and dining discovery near your base.'],['Art and architecture','Stay close to the places you want to explore.'],['Arrival-friendly stays','Consider airport or station connections.'],['Longer stays','Compare the practical details for a longer visit.']]}
    ]},
    activities:{name:'Experiences',supplier:'Viator',url:'https://www.viator.com/',intro:'Browse experiences by interest, location, and the time available in each Journey day.',rows:[
      {title:'Popular interests',hint:'Find the kind of experience you want.',items:[['Architecture and art','Explore guided visits and creative landmarks.'],['City walks','Discover neighborhoods at a comfortable pace.'],['On the water','Explore coastal and harbor experiences.'],['Food and culture','Connect tastings with the stories of a place.'],['Museums and collections','Build time for exhibits and galleries.']]},
      {title:'Fit the daily route',hint:'Plan around meeting points and time windows.',items:[['Morning experiences','Start a day with a focused activity.'],['Afternoon discoveries','Leave room for a longer midday outing.'],['Evening plans','Explore activities after the daytime route.'],['Near your stay','Look for meeting points close to the hotel.'],['Flexible time','Browse ideas that can fit an open day.']]},
      {title:'Explore your way',hint:'Compare pace, group format, and interests.',items:[['Small groups','Consider a more personal group format.'],['Family-friendly ideas','Browse experiences suitable for a shared trip.'],['Outdoor activities','Make the most of the destination outdoors.'],['History and culture','Learn more about places on the itinerary.'],['Food tours','Connect local tastes with a guided walk.']]}
    ]},
    food:{name:'Food experiences',supplier:'OpenTable',url:'https://www.opentable.com/',intro:'Explore restaurants and food experiences that can fit naturally around your plans.',rows:[
      {title:'Restaurants and tables',hint:'Choose dining around a place and time.',items:[['Near your hotel','Find dinner close to the stay.'],['Neighborhood restaurants','Explore the area around a Journey stop.'],['Dinner after activities','Leave enough travel time after the day’s plans.'],['Group dining','Consider party size and table arrangements.'],['Special occasion','Explore a meal that becomes part of the trip.']]},
      {title:'Taste the destination',hint:'Explore food beyond a restaurant booking.',items:[['Food tours','Discover a neighborhood through its food.'],['Market visits','Explore local markets and ingredients.'],['Tastings','Make time for a focused tasting experience.'],['Cooking experiences','Browse hands-on food activities.'],['Local specialties','Collect dishes and places to explore.']]},
      {title:'Plan around your day',hint:'Keep dining close to the itinerary.',items:[['Breakfast nearby','Start close to the hotel or first stop.'],['Lunch between stops','Plan a break along the daily route.'],['Evening reservations','Make space for a timed dinner.'],['Flexible dining','Keep an option for a changing day.'],['Food and culture','Pair a meal with a neighborhood visit.']]}
    ]},
    places:{name:'Places',supplier:'Google Maps',url:'https://www.google.com/maps/',intro:'Build richer Journey days with landmarks, neighborhoods, and nearby discoveries.',rows:[
      {title:'Highlights and landmarks',hint:'Choose places that shape a day.',items:[['Major landmarks','Put the best-known sights in context.'],['Architecture','Explore buildings and public spaces.'],['Museums','Make time for collections and exhibits.'],['Squares and streets','Discover the spaces between stops.'],['Views and lookouts','Add a pause with a view.']]},
      {title:'Explore neighborhoods',hint:'Cluster nearby stops to reduce travel time.',items:[['Waterfront','Plan time by the coast or river.'],['Historic streets','Explore older parts of the destination.'],['Arts districts','Find creative spaces and galleries.'],['Markets and shops','Browse places with a local rhythm.'],['Near the hotel','Discover options close to your base.']]},
      {title:'Room to wander',hint:'Balance planned stops with flexible time.',items:[['Parks and gardens','Leave time for open air and rest.'],['Promenades','Connect stops with an enjoyable walk.'],['Family places','Add options for shared discovery.'],['Quiet corners','Find space between busy activities.'],['Evening walks','Explore places suited to a slower finish.']]}
    ]}
  }[category];
  if(!provider)return;

  const params=new URLSearchParams(location.search);
  const destination=(params.get('destination')||'').trim();
  const supplierUrl=category==='places'?(destination?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`:provider.url):provider.url;
  const main=document.querySelector('main');
  if(!main)return;
  main.querySelector('.hero .eyebrow').textContent=destination?`${destination} · ${provider.name}`:provider.name;
  main.querySelector('.hero h1').textContent=`Explore ${provider.name.toLowerCase()} for your Journey.`;
  main.querySelector('.hero p').textContent=provider.intro;
  main.querySelectorAll(':scope > .intro,:scope > .block').forEach(node=>node.remove());
  const jump=main.querySelector('.jump');

  const introduction=document.createElement('section');introduction.className='wrap category-store-intro';
  const kicker=document.createElement('div');kicker.className='kicker';kicker.textContent='TourGuid Travel Store';
  const heading=document.createElement('h2');heading.textContent=destination?`Browse ${provider.name.toLowerCase()} in ${destination}`:`Browse ${provider.name.toLowerCase()}`;
  const copy=document.createElement('p');copy.textContent='Three collections are visible below. Use the arrows or swipe to see more ideas in each row.';
  const note=document.createElement('div');note.className='category-store-note';note.textContent=destination?'These are editorial discovery ideas. Current inventory, prices, availability and booking terms are confirmed by the named provider.':'Choose a destination on the Travel Store page to see places, stays and experiences for it. Until then these are general editorial ideas, not results for any place.';
  introduction.append(kicker,heading,copy,note);jump.after(introduction);

  const renderRow=(eyebrowText,row,fill)=>{
    const section=document.createElement('section');section.className='wrap category-row';
    const head=document.createElement('div');head.className='category-row-head';
    const titleGroup=document.createElement('div');
    const eyebrow=document.createElement('div');eyebrow.className='kicker';eyebrow.textContent=eyebrowText;
    const title=document.createElement('h2');title.textContent=row.title;
    const hint=document.createElement('p');hint.textContent=row.hint;
    titleGroup.append(eyebrow,title,hint);
    const controls=document.createElement('div');controls.className='category-row-controls';
    const count=document.createElement('span');count.className='category-row-count';count.setAttribute('aria-live','polite');
    const previous=document.createElement('button');previous.type='button';previous.textContent='‹';previous.setAttribute('aria-label',`Previous ${row.title.toLowerCase()}`);
    const next=document.createElement('button');next.type='button';next.textContent='›';next.setAttribute('aria-label',`Next ${row.title.toLowerCase()}`);
    controls.append(count,previous,next);head.append(titleGroup,controls);
    const track=document.createElement('div');track.className='category-track';track.setAttribute('aria-label',`${row.title} carousel`);track.tabIndex=0;
    fill(track);
    section.append(head,track);main.append(section);
    const update=()=>{const step=track.children[0].getBoundingClientRect().width+18;const visible=window.matchMedia('(max-width:580px)').matches?1:window.matchMedia('(max-width:850px)').matches?2:3;const start=Math.min(track.children.length-visible,Math.max(0,Math.round(track.scrollLeft/step)));count.textContent=`${start+1}–${Math.min(start+visible,track.children.length)} of ${track.children.length}`;previous.disabled=start===0;next.disabled=start+visible>=track.children.length};
    previous.addEventListener('click',()=>track.scrollBy({left:-(track.children[0].getBoundingClientRect().width+18),behavior:'smooth'}));
    next.addEventListener('click',()=>track.scrollBy({left:track.children[0].getBoundingClientRect().width+18,behavior:'smooth'}));
    track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();
  };

  const money=(amount,currency)=>{try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD'}).format(amount)}catch{return `${currency||''} ${amount}`.trim()}};
  const typeLabel=category==='hotels'?'Hotel':category==='places'?'Place':category==='food'?'Food experience':'Activity';
  const liveCard=(item,index)=>{
    const card=document.createElement('article');card.className='collection-card live-card';
    const art=document.createElement('div');art.className='collection-art';
    if(item.photo){art.style.backgroundImage=`url("${item.photo}")`;art.style.backgroundSize='cover';art.style.backgroundPosition='center'}
    if(item.photoCredit){const credit=document.createElement('span');credit.textContent=`Photo: ${item.photoCredit}`;art.append(credit)}
    const body=document.createElement('div');body.className='collection-copy';
    const source=document.createElement('div');source.className='source';source.textContent=item.type?`${item.source||provider.supplier} · ${item.type}`:(item.source||provider.supplier);
    const name=document.createElement('h3');name.textContent=item.title;
    const summary=document.createElement('p');summary.textContent=item.summary||'';
    const meta=[];
    if(typeof item.rating==='number'){const combined=Array.isArray(item.reviewSources)&&item.reviewSources.length>1;meta.push(`★ ${item.rating.toFixed(1)}${item.reviewCount?` (${item.reviewCount.toLocaleString()}${combined?' combined':''})`:''}`)}
    if(item.durationMinutes)meta.push(item.durationMinutes>=60?`${Math.round(item.durationMinutes/60*10)/10} hr`:`${item.durationMinutes} min`);
    if(item.instantConfirmation)meta.push('Confirms instantly');
    if(item.bookable&&typeof item.price==='number')meta.push(`from ${money(item.price,item.currency)}`);
    const facts=document.createElement('p');facts.className='live-facts';facts.textContent=meta.join(' · ');
    const actions=document.createElement('div');actions.className='collection-actions';
    if(item.url){const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener';link.textContent=item.bookable?`Book on ${item.source} ↗`:'View details ↗';actions.append(link)}
    body.append(source,name,summary);if(meta.length)body.append(facts);body.append(actions);card.append(art,body);
    window.TourGuidJourney?.addButton(actions,{id:`${category}-live-${item.id||index}`,title:item.title,type:typeLabel,kind:'live',location:destination,source:item.source||provider.supplier});
    return card;
  };
  // Live results for the searched city lead the page; the editorial rows
  // follow. No destination, or a feed that is not live, leaves only the
  // editorial rows -- never a substitute invented to fill the space.
  const lat=params.get('lat'),lon=params.get('lon');
  let liveItems=[];
  if(destination){
    try{
      const q=new URLSearchParams({destination,categories:category});
      for(const key of ['region','country','countryCode','lat','lon'])if(params.get(key))q.set(key,params.get(key));
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
      const response=await fetch(`/api/store/feed?${q}`,{signal:controller.signal,headers:{Accept:'application/json'}});
      clearTimeout(timer);
      if(response.ok){const feed=await response.json();const entry=feed?.categories?.[category];if(entry?.live&&Array.isArray(entry.items))liveItems=entry.items}
    }catch{liveItems=[]}
  }
  if(liveItems.length)renderRow('Live results',{title:`${provider.name} in ${destination}`,hint:'Current listings for this place from the named providers. Confirm price and terms with the provider.'},track=>liveItems.forEach((item,i)=>track.append(liveCard(item,i))));
  provider.rows.forEach((row,rowIndex)=>renderRow(`Collection ${rowIndex+1} of 3`,row,track=>{
    for(const [itemIndex,[itemTitle,itemSummary]] of row.items.entries()){
      const card=document.createElement('article');card.className='collection-card';
      const art=document.createElement('div');art.className='collection-art';
      const caption=document.createElement('span');caption.textContent=`${provider.name} · ${String(itemIndex+1).padStart(2,'0')}`;art.append(caption);
      const body=document.createElement('div');body.className='collection-copy';
      const source=document.createElement('div');source.className='source';source.textContent='Editorial idea';
      const name=document.createElement('h3');name.textContent=itemTitle;
      const summary=document.createElement('p');summary.textContent=itemSummary;
      const actions=document.createElement('div');actions.className='collection-actions';
      if(category!=='hotels'){
        const external=document.createElement('a');external.href=supplierUrl;external.target='_blank';external.rel='noopener';external.textContent=`Browse on ${provider.supplier} ↗`;
        external.addEventListener('click',event=>{if(window.TourGuidJourney?.handoffDialog){event.preventDefault();window.TourGuidJourney.handoffDialog(external,{title:name.textContent,type:category==='hotels'?'Hotel':category==='places'?'Place':category==='food'?'Food experience':'Activity'})}});
        actions.append(external);
      }
      body.append(source,name,summary,actions);card.append(art,body);track.append(card);
      window.TourGuidJourney?.addButton(actions,{id:`${category}-${rowIndex}-${itemIndex}`,title:name.textContent,type:category==='hotels'?'Hotel':category==='places'?'Place':category==='food'?'Food experience':'Activity',kind:'theme',location:destination,source:provider.supplier});
    }
  }));
  const foot=document.createElement('div');foot.className='wrap category-store-footer';foot.textContent=`TourGuid can save these ideas to a Journey. A booking is confirmed only by the named provider.`;main.append(foot);
  document.querySelector('.footer span').textContent=`TourGuid · ${provider.name} store`;
  for(const link of document.querySelectorAll('a[href^="./"]')){
    const url=new URL(link.href,location.href);
    if(!url.pathname.endsWith('.html'))continue;
    if(!['index.html','hotels.html','activities.html','food.html','places.html','flights.html'].some(page=>url.pathname.endsWith(page)))continue;
    for(const key of ['destination','region','country','countryCode','lat','lon','from','to'])if(key==='destination'||params.has(key))url.searchParams.set(key,key==='destination'?destination:params.get(key));
    // Never leave the query string on a '.html' path: this server (and
    // Cloudflare's own default asset handling) redirects that filename to
    // its clean-URL equivalent and drops every query parameter in the
    // process -- silently discarding the destination on the very next click.
    url.pathname=url.pathname.replace(/\.html$/,'');
    link.href=url.href;
  }
})();
