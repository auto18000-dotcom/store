(()=>{
  const category=location.pathname.split('/').pop().replace('.html','');
  const provider={
    hotels:{name:'Hotels',supplier:'TourGuid',url:'',intro:'Explore places to stay by location, style, and the way they fit your Journey.',rows:[
      {title:'Featured stays',hint:'Start with a property or a stay style.',items:[['Hotel Arts Barcelona','A waterfront property showcase with official hotel information.'],['Waterfront stays','Keep the coast and open space close to your stay.'],['City center stays','Look for a base near major sights and transport.'],['Boutique stays','Explore smaller hotels with a distinct setting.'],['Family stays','Compare room arrangements and neighborhood access.']]},
      {title:'Explore neighborhoods',hint:'Choose a base that works for the day plan.',items:[['Waterfront districts','Plan for coastal walks and dining nearby.'],['Historic center','Keep older streets and city landmarks within reach.'],['Shopping districts','Explore a stay close to shopping and transit.'],['Near transit','Consider how easy it is to reach each day’s stops.'],['Quieter areas','Explore a slower base beyond the busiest blocks.']]},
      {title:'Match your Journey',hint:'Compare hotels by what matters to your trip.',items:[['Walkable days','Shorten travel between your hotel and activities.'],['Food-focused stays','Plan dinner and dining discovery near your base.'],['Art and architecture','Stay close to the places you want to explore.'],['Arrival-friendly stays','Consider airport or station connections.'],['Longer stays','Compare the practical details for a longer visit.']]}
    ]},
    activities:{name:'Experiences',supplier:'Viator',url:'https://www.viator.com/Barcelona/d562-ttd',intro:'Browse experiences by interest, location, and the time available in each Journey day.',rows:[
      {title:'Popular interests',hint:'Find the kind of experience you want.',items:[['Architecture and art','Explore guided visits and creative landmarks.'],['City walks','Discover neighborhoods at a comfortable pace.'],['On the water','Explore coastal and harbor experiences.'],['Food and culture','Connect tastings with the stories of a place.'],['Museums and collections','Build time for exhibits and galleries.']]},
      {title:'Fit the daily route',hint:'Plan around meeting points and time windows.',items:[['Morning experiences','Start a day with a focused activity.'],['Afternoon discoveries','Leave room for a longer midday outing.'],['Evening plans','Explore activities after the daytime route.'],['Near your stay','Look for meeting points close to the hotel.'],['Flexible time','Browse ideas that can fit an open day.']]},
      {title:'Explore your way',hint:'Compare pace, group format, and interests.',items:[['Small groups','Consider a more personal group format.'],['Family-friendly ideas','Browse experiences suitable for a shared trip.'],['Outdoor activities','Make the most of the destination outdoors.'],['History and culture','Learn more about places on the itinerary.'],['Food tours','Connect local tastes with a guided walk.']]}
    ]},
    food:{name:'Food experiences',supplier:'OpenTable',url:'https://www.opentable.com/barcelona-restaurants',intro:'Explore restaurants and food experiences that can fit naturally around your plans.',rows:[
      {title:'Restaurants and tables',hint:'Choose dining around a place and time.',items:[['Near your hotel','Find dinner close to the stay.'],['Neighborhood restaurants','Explore the area around a Journey stop.'],['Dinner after activities','Leave enough travel time after the day’s plans.'],['Group dining','Consider party size and table arrangements.'],['Special occasion','Explore a meal that becomes part of the trip.']]},
      {title:'Taste the destination',hint:'Explore food beyond a restaurant booking.',items:[['Food tours','Discover a neighborhood through its food.'],['Market visits','Explore local markets and ingredients.'],['Tastings','Make time for a focused tasting experience.'],['Cooking experiences','Browse hands-on food activities.'],['Local specialties','Collect dishes and places to explore.']]},
      {title:'Plan around your day',hint:'Keep dining close to the itinerary.',items:[['Breakfast nearby','Start close to the hotel or first stop.'],['Lunch between stops','Plan a break along the daily route.'],['Evening reservations','Make space for a timed dinner.'],['Flexible dining','Keep an option for a changing day.'],['Food and culture','Pair a meal with a neighborhood visit.']]}
    ]},
    places:{name:'Places',supplier:'Google Maps',url:'https://www.google.com/maps/search/?api=1&query=Barcelona%20Spain',intro:'Build richer Journey days with landmarks, neighborhoods, and nearby discoveries.',rows:[
      {title:'Highlights and landmarks',hint:'Choose places that shape a day.',items:[['Major landmarks','Put the best-known sights in context.'],['Architecture','Explore buildings and public spaces.'],['Museums','Make time for collections and exhibits.'],['Squares and streets','Discover the spaces between stops.'],['Views and lookouts','Add a pause with a view.']]},
      {title:'Explore neighborhoods',hint:'Cluster nearby stops to reduce travel time.',items:[['Waterfront','Plan time by the coast or river.'],['Historic streets','Explore older parts of the destination.'],['Arts districts','Find creative spaces and galleries.'],['Markets and shops','Browse places with a local rhythm.'],['Near the hotel','Discover options close to your base.']]},
      {title:'Room to wander',hint:'Balance planned stops with flexible time.',items:[['Parks and gardens','Leave time for open air and rest.'],['Promenades','Connect stops with an enjoyable walk.'],['Family places','Add options for shared discovery.'],['Quiet corners','Find space between busy activities.'],['Evening walks','Explore places suited to a slower finish.']]}
    ]}
  }[category];
  if(!provider)return;

  const params=new URLSearchParams(location.search);
  const destination=(params.get('destination')||'Barcelona').trim();
  const isBarcelona=destination.toLowerCase().startsWith('barcelona');
  const supplierUrl=category==='places'?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`:isBarcelona?provider.url:category==='activities'?'https://www.viator.com/':category==='food'?'https://www.opentable.com/':provider.url;
  const main=document.querySelector('main');
  if(!main)return;
  main.querySelector('.hero .eyebrow').textContent=`${destination} · ${provider.name}`;
  main.querySelector('.hero h1').textContent=`Explore ${provider.name.toLowerCase()} for your Journey.`;
  main.querySelector('.hero p').textContent=provider.intro;
  main.querySelectorAll(':scope > .intro,:scope > .block').forEach(node=>node.remove());
  const jump=main.querySelector('.jump');

  const introduction=document.createElement('section');introduction.className='wrap category-store-intro';
  const kicker=document.createElement('div');kicker.className='kicker';kicker.textContent='TourGuid Travel Store';
  const heading=document.createElement('h2');heading.textContent=`Browse ${provider.name.toLowerCase()} in ${destination}`;
  const copy=document.createElement('p');copy.textContent='Three collections are visible below. Use the arrows or swipe to see more ideas in each row.';
  const note=document.createElement('div');note.className='category-store-note';note.textContent='These are editorial discovery ideas. Current inventory, prices, availability and booking terms are confirmed by the named provider.';
  introduction.append(kicker,heading,copy,note);jump.after(introduction);

  for(const [rowIndex,row] of provider.rows.entries()){
    const section=document.createElement('section');section.className='wrap category-row';
    const head=document.createElement('div');head.className='category-row-head';
    const titleGroup=document.createElement('div');
    const eyebrow=document.createElement('div');eyebrow.className='kicker';eyebrow.textContent=`Collection ${rowIndex+1} of 3`;
    const title=document.createElement('h2');title.textContent=row.title;
    const hint=document.createElement('p');hint.textContent=row.hint;
    titleGroup.append(eyebrow,title,hint);
    const controls=document.createElement('div');controls.className='category-row-controls';
    const count=document.createElement('span');count.className='category-row-count';count.setAttribute('aria-live','polite');
    const previous=document.createElement('button');previous.type='button';previous.textContent='‹';previous.setAttribute('aria-label',`Previous ${row.title.toLowerCase()}`);
    const next=document.createElement('button');next.type='button';next.textContent='›';next.setAttribute('aria-label',`Next ${row.title.toLowerCase()}`);
    controls.append(count,previous,next);head.append(titleGroup,controls);
    const track=document.createElement('div');track.className='category-track';track.setAttribute('aria-label',`${row.title} carousel`);track.tabIndex=0;
    for(const [itemIndex,[itemTitle,itemSummary]] of row.items.entries()){
      const card=document.createElement('article');card.className='collection-card';
      const art=document.createElement('div');art.className='collection-art';
      const caption=document.createElement('span');caption.textContent=`${provider.name} · ${String(itemIndex+1).padStart(2,'0')}`;art.append(caption);
      const body=document.createElement('div');body.className='collection-copy';
      const source=document.createElement('div');source.className='source';source.textContent=isBarcelona&&category==='hotels'&&itemTitle==='Hotel Arts Barcelona'?'Property showcase':'Editorial idea';
      const name=document.createElement('h3');name.textContent=!isBarcelona&&itemTitle==='Hotel Arts Barcelona'?'Stay near your plans':itemTitle;
      const summary=document.createElement('p');summary.textContent=!isBarcelona&&itemTitle==='Hotel Arts Barcelona'?'Explore a hotel base that fits the places and activities on your route.':itemSummary;
      const actions=document.createElement('div');actions.className='collection-actions';
      if(category!=='hotels'||isBarcelona&&itemTitle==='Hotel Arts Barcelona'){
        const external=document.createElement('a');external.href=category==='hotels'?'https://www.ritzcarlton.com/en/hotels/bcnrz-hotel-arts-barcelona/overview/':supplierUrl;external.target='_blank';external.rel='noopener';external.textContent=category==='hotels'?'Official hotel ↗':`Browse on ${provider.supplier} ↗`;
        external.addEventListener('click',event=>{if(window.TourGuidJourney?.handoffDialog){event.preventDefault();window.TourGuidJourney.handoffDialog(external,{title:name.textContent,type:category==='hotels'?'Hotel':category==='places'?'Place':category==='food'?'Food experience':'Activity'})}});
        actions.append(external);
      }
      body.append(source,name,summary,actions);card.append(art,body);track.append(card);
      window.TourGuidJourney?.addButton(actions,{id:`${category}-${rowIndex}-${itemIndex}`,title:name.textContent,type:category==='hotels'?'Hotel':category==='places'?'Place':category==='food'?'Food experience':'Activity',kind:isBarcelona&&category==='hotels'&&itemTitle==='Hotel Arts Barcelona'?'property':'theme',location:destination,source:provider.supplier});
    }
    section.append(head,track);main.append(section);
    const update=()=>{const step=track.children[0].getBoundingClientRect().width+18;const visible=window.matchMedia('(max-width:580px)').matches?1:window.matchMedia('(max-width:850px)').matches?2:3;const start=Math.min(track.children.length-visible,Math.max(0,Math.round(track.scrollLeft/step)));count.textContent=`${start+1}–${Math.min(start+visible,track.children.length)} of ${track.children.length}`;previous.disabled=start===0;next.disabled=start+visible>=track.children.length};
    previous.addEventListener('click',()=>track.scrollBy({left:-(track.children[0].getBoundingClientRect().width+18),behavior:'smooth'}));
    next.addEventListener('click',()=>track.scrollBy({left:track.children[0].getBoundingClientRect().width+18,behavior:'smooth'}));
    track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();
  }
  const foot=document.createElement('div');foot.className='wrap category-store-footer';foot.textContent=`TourGuid can save these ideas to a Journey. A booking is confirmed only by the named provider.`;main.append(foot);
  document.querySelector('.footer span').textContent=`TourGuid · ${provider.name} store`;
  for(const link of document.querySelectorAll('a[href^="./"]')){
    const url=new URL(link.href,location.href);
    if(!url.pathname.endsWith('.html'))continue;
    if(!['index.html','hotels.html','activities.html','food.html','places.html','flights.html'].some(page=>url.pathname.endsWith(page)))continue;
    for(const key of ['destination','from','to'])if(key==='destination'||params.has(key))url.searchParams.set(key,key==='destination'?destination:params.get(key));link.href=url.href;
  }
})();
