(()=>{
  const storageKey='tourguid-travel-store-journey-prototype-v1';
  const itinerary=document.querySelector('#workspace-itinerary');
  const mapNode=document.querySelector('#destination-map');
  if(!itinerary||!mapNode)return;

  // Destination-neutral. The chosen place (from the search bar) is the only
  // source of "where": its name, and its coordinates when the suggestion
  // supplied them. Nothing here invents a hotel, a stop or a transit line for
  // a place -- those appear only when a real Card or a real source supplies them.
  const params=new URLSearchParams(location.search);
  const chosen=window.TourGuidDestination||null;
  const destinationName=(params.get('destination')||chosen?.name||'').trim();
  const lat=Number(params.get('lat')??chosen?.lat),lon=Number(params.get('lon')??chosen?.lon);
  const center=destinationName&&Number.isFinite(lat)&&Number.isFinite(lon)&&(params.get('lat')!==null||chosen?.lat!=null)?[lat,lon]:null;

  const workspace=document.querySelector('#trip-workspace');
  const toolsToggle=document.querySelector('#tools-toggle');
  const toolsState=document.querySelector('#tools-tab-state');
  const wireDisclosure=onOpen=>{
    if(!workspace||!toolsToggle||!toolsState)return()=>{};
    const setToolsOpen=open=>{workspace.hidden=!open;toolsToggle.setAttribute('aria-expanded',String(open));toolsState.textContent=open?'Hide optimization tools':'Show optimization tools';if(open&&onOpen)setTimeout(onOpen,80)};
    toolsToggle.addEventListener('click',()=>setToolsOpen(workspace.hidden));
    document.querySelector('#view-journey-link')?.addEventListener('click',()=>setToolsOpen(true));
    return setToolsOpen;
  };

  const anchorInput=document.querySelector('#hotel-anchor');
  const anchorStatus=document.querySelector('#hotel-anchor-status');
  const transitButton=document.querySelector('#map-transit');
  // No hotel list exists until a real accommodation source supplies one.
  if(anchorInput){anchorInput.value='';anchorInput.disabled=true;anchorInput.placeholder='Hotels for this destination will be offered here';}
  if(anchorStatus)anchorStatus.textContent='Distance rings appear around a hotel once you choose one from a real accommodation source.';
  // Transit needs a licensed routing/transit source. Until one is connected the
  // layer says so instead of drawing a synthetic network.
  if(transitButton){transitButton.disabled=true;transitButton.setAttribute('aria-pressed','false');transitButton.textContent='TRANSIT · UNAVAILABLE';transitButton.title='No licensed transit data is connected yet.';}

  if(!center){
    wireDisclosure(null);
    mapNode.innerHTML=`<div class="map-fallback"><div><strong>${destinationName?destinationName.replace(/[&<>"']/g,''):'Choose a destination'}</strong><br><span>${destinationName?'Pick this place from the suggestions in the search bar so its location is known, then the map will center on it.':'Choose a destination in the search bar and the map will center on it.'}</span></div></div>`;
    itinerary.innerHTML='<p class="workspace-empty">Nothing to plan against yet. Choose a destination first.</p>';
    return;
  }

  const categoryFor=item=>item.type==='Hotel'?'hotel':item.type==='Place'?'site':'activity';
  // Scoped by destination as well as day so another place's saved Cards never
  // bleed into this one just because they share a day number.
  const readItems=()=>{try{const value=JSON.parse(localStorage.getItem(storageKey));return Array.isArray(value)?value.filter(item=>item.journeyDestination===destinationName):[]}catch{return []}};
  const dayButtons=[...document.querySelectorAll('.day-chip[data-day]')];
  const requestedDay=Number(params.get('day'));
  let activeDay=[1,2,3].includes(requestedDay)?requestedDay:1,activeStops=[],drawMap=()=>{},refreshMap=()=>{};

  // Great-circle straight-line distance: an illustrative estimate, never a route.
  const distanceMeters=(a,b)=>{const rad=Math.PI/180,lat1=a[0]*rad,lat2=b[0]*rad,dLat=(b[0]-a[0])*rad,dLon=(b[1]-a[1])*rad;const q=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))};
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const syncJourneyLink=()=>{const link=document.querySelector('.itinerary-link');if(link)link.href=`./journey-building?destination=${encodeURIComponent(destinationName)}&day=${activeDay}#planner`};

  const createStop=stop=>{
    const row=document.createElement('div');row.className='workspace-stop';
    const dot=document.createElement('span');dot.className='stop-dot';dot.textContent=String(stop.sequence).padStart(2,'0');
    const copy=document.createElement('div');copy.className=`stop-copy type-${stop.category}`;
    const category=document.createElement('em');category.textContent=stop.category==='site'?'Must-see site':stop.category;
    const title=document.createElement('strong');title.textContent=stop.label;
    const detail=document.createElement('small');
    detail.textContent=`${stop.position?'':'Map location to confirm · '}${stop.date||'Date to be chosen'} · ${stop.status==='idea'?'Saved idea':'Planned, not booked'}`;
    copy.append(category,title,detail);row.append(dot,copy);return row;
  };
  const renderDay=()=>{
    dayButtons.forEach(button=>{const selected=Number(button.dataset.day)===activeDay;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    // One ordered list feeds both the rows and the map markers, so a Card with
    // no coordinate keeps its number instead of shifting the pins around it.
    const stops=readItems().filter(item=>Number(item.dayIndex||1)===activeDay).map((item,index)=>({id:item.catalogId||item.title,label:item.title,category:categoryFor(item),position:Number.isFinite(item.lat)&&Number.isFinite(item.lon)?[item.lat,item.lon]:null,date:item.date,status:item.status,sequence:index+1}));
    itinerary.replaceChildren();
    if(!stops.length){const empty=document.createElement('p');empty.className='workspace-empty';empty.textContent=`Nothing planned for Day ${activeDay} in ${destinationName} yet. Use Add to Journey on a hotel, activity, place or restaurant.`;itinerary.append(empty)}
    stops.forEach(stop=>itinerary.append(createStop(stop)));
    const mapped=stops.filter(stop=>Array.isArray(stop.position));
    const meters=mapped.slice(1).reduce((total,stop,index)=>total+distanceMeters(mapped[index].position,stop.position),0);
    const distanceNote=mapped.length>1?` · about ${(meters/1000).toFixed(1)} km straight-line (illustrative, not a route)`:'';
    const unplaced=stops.length-mapped.length;
    document.querySelector('#day-summary').textContent=`Day ${activeDay} · ${destinationName} · ${stops.length} ${stops.length===1?'stop':'stops'}${distanceNote}${unplaced?` · ${unplaced} awaiting an exact map location`:''}.`;
    syncJourneyLink();
    drawMap(mapped);
  };
  dayButtons.forEach(button=>button.addEventListener('click',()=>{activeDay=Number(button.dataset.day);renderDay()}));
  window.addEventListener('storage',renderDay);

  wireDisclosure(()=>refreshMap());
  if(!window.L){mapNode.innerHTML=`<div class="map-fallback"><div><strong>${escapeHtml(destinationName)} daily map</strong><br><span>Map tiles are unavailable. Saved stops remain listed in the itinerary.</span></div></div>`;renderDay();return}

  const map=L.map(mapNode,{zoomControl:false,attributionControl:true}).setView(center,12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  L.circleMarker(center,{radius:4,color:'#87918f',weight:1,fillColor:'#87918f',fillOpacity:.8}).addTo(map).bindTooltip(escapeHtml(destinationName),{permanent:true,direction:'top',offset:[0,-6],className:'transit-label'});
  const dayLayer=L.layerGroup().addTo(map);
  drawMap=stops=>{
    activeStops=stops;
    dayLayer.clearLayers();
    stops.forEach(stop=>{
      const icon=L.divIcon({className:`map-stop-icon type-${stop.category}`,html:`<span class="pin-dot">${stop.sequence}</span>`,iconSize:[30,30],iconAnchor:[15,15]});
      const direction=stop.category==='hotel'?'left':stop.category==='activity'?'top':'right';
      const offset=direction==='left'?[-8,0]:direction==='top'?[0,-8]:[8,0];
      L.marker(stop.position,{icon}).addTo(dayLayer).bindTooltip(escapeHtml(stop.label),{permanent:true,direction,offset,className:`map-stop-label type-${stop.category}`});
    });
    if(stops.length>1)L.polyline(stops.map(stop=>stop.position),{color:'#e07824',weight:4,opacity:.96,dashArray:'10 6',interactive:false}).addTo(dayLayer);
    const points=[center,...stops.map(stop=>stop.position)];
    map.fitBounds(L.latLngBounds(points).pad(.25),{padding:[48,48],maxZoom:14,animate:false});
  };
  refreshMap=()=>{map.invalidateSize();drawMap(activeStops)};
  renderDay();
  const panel=document.querySelector('#map-panel');
  document.querySelector('#map-zoom-in').addEventListener('click',()=>map.zoomIn());
  document.querySelector('#map-zoom-out').addEventListener('click',()=>map.zoomOut());
  document.querySelector('#map-max-one').addEventListener('click',event=>{workspace.classList.toggle('map-wide');event.currentTarget.setAttribute('aria-pressed',String(workspace.classList.contains('map-wide')));setTimeout(()=>map.invalidateSize(),260)});
  document.querySelector('#map-max-two').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else panel.requestFullscreen?.()});
  document.addEventListener('fullscreenchange',()=>setTimeout(()=>map.invalidateSize(),80));
})();
