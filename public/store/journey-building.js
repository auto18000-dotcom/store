(()=>{
  'use strict';
  const cardKey='tourguid-travel-store-journey-prototype-v1';
  const setupKey='tourguid-journey-builder-setup-v1';
  const notesKey='tourguid-journey-builder-notes-v1';
  const params=new URLSearchParams(location.search);
  const $=id=>document.getElementById(id);
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const safeText=value=>String(value??'');
  const initial=read(setupKey,{});
  const setup={
    destination:safeText(params.get('destination')||initial.destination||'').trim(),
    start:safeText(params.get('from')||initial.start||''),
    end:safeText(params.get('to')||initial.end||''),
    travelers:Number(initial.travelers)||1
  };
  let day=Math.max(1,Number(params.get('day'))||1);
  let map=null,markers=[];
  // Coordinates come from Cards that carry their own lat/lon; nothing is
  // looked up from a built-in list of places.
  const locations={};
  const cards=()=>{
    const value=read(cardKey,[]);
    return Array.isArray(value)?value:[];
  };
  const destinationKey=value=>safeText(value).split(',')[0].trim().toLowerCase();
  const belongs=item=>destinationKey(item.journeyDestination||'')===destinationKey(setup.destination);
  const saveCards=value=>{
    if(!write(cardKey,value))$('setup-message').textContent='This browser could not save your changes. Check browser storage and try again.';
  };
  const utcDate=value=>value?new Date(value+'T12:00:00Z'):null;
  const dayCount=()=>{
    const a=utcDate(setup.start),b=utcDate(setup.end);
    if(!a||!b||b<a)return 3;
    return Math.min(30,Math.max(1,Math.round((b-a)/86400000)+1));
  };
  const dateFor=index=>{
    if(!setup.start)return '';
    const base=utcDate(setup.start);
    base.setUTCDate(base.getUTCDate()+index-1);
    return base.toISOString().slice(0,10);
  };
  const displayDate=value=>value?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(utcDate(value)):'Date to be chosen';
  const destinationQuery=()=>new URLSearchParams({destination:setup.destination, ...(setup.start?{from:setup.start}:{}),...(setup.end?{to:setup.end}:{})}).toString();
  const syncLinks=()=>{
    $('store-link').href='./index.html?'+destinationQuery()+'#hotels';
    $('map-link').href='./index.html?'+destinationQuery()+'&day='+day+'#tools';
  };
  const isProtected=item=>['booked','confirmed','purchased'].includes(String(item.status||'').toLowerCase());
  const showCard=index=>{
    const node=document.querySelector(`[data-card-index="${index}"]`);
    node?.classList.add('active');
    setTimeout(()=>node?.classList.remove('active'),1800);
    const marker=markers.find(entry=>entry.index===index);
    if(marker&&map){map.setView(marker.marker.getLatLng(),14);marker.marker.openPopup()}
  };
  const renderMap=()=>{
    const node=$('journey-map');
    if(!window.L){node.innerHTML='<div class="map-fallback">Map tiles are unavailable. Your Activity Cards remain in the day list.</div>';return}
    if(!map){
      map=L.map(node,{zoomControl:true}).setView([41.3874,2.1686],12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    }
    markers.forEach(entry=>map.removeLayer(entry.marker));markers=[];
    const selected=cards().map((item,index)=>({item,index})).filter(({item})=>belongs(item)&&Number(item.dayIndex||1)===day);
    selected.forEach(({item,index},order)=>{
      const point=Array.isArray(item.coordinates)?item.coordinates:locations[item.catalogId];
      if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))return;
      const icon=L.divIcon({className:'',html:`<span class="map-pin">${order+1}</span>`,iconSize:[29,29],iconAnchor:[14,14]});
      const marker=L.marker(point,{icon}).addTo(map);
      const popup=document.createElement('div');
      const title=document.createElement('strong');title.textContent=item.title||'Activity Card';
      const detail=document.createElement('div');detail.textContent=`${item.type||'Plan'} · ${isProtected(item)?'Booked':'Planning card'}`;
      popup.append(title,detail);marker.bindPopup(popup);
      marker.on('click',()=>{const card=document.querySelector(`[data-card-index="${index}"]`);card?.scrollIntoView({block:'nearest',behavior:'smooth'});card?.classList.add('active');setTimeout(()=>card?.classList.remove('active'),1800)});
      markers.push({index,marker});
    });
    $('map-summary').textContent=markers.length?`${markers.length} mapped ${markers.length===1?'card':'cards'}`:'No mapped cards yet';
    if(markers.length){map.fitBounds(L.latLngBounds(markers.map(entry=>entry.marker.getLatLng())).pad(.3),{maxZoom:14,padding:[20,20]})}
    else if(params.get('lat')&&params.get('lon')&&Number.isFinite(Number(params.get('lat')))&&Number.isFinite(Number(params.get('lon'))))map.setView([Number(params.get('lat')),Number(params.get('lon'))],12);
    else {map.setView([20,0],2);node.setAttribute('aria-label','No known map coordinates for the selected destination')}
    setTimeout(()=>map.invalidateSize(),50);
  };
  const renderGaps=()=>{
    const content=$('gap-content');content.replaceChildren();
    const all=cards().filter(belongs);
    const gaps=[];
    if(!all.some(item=>item.type==='Hotel'&&isProtected(item)))gaps.push({title:'Stay still to confirm',detail:'There is no confirmed hotel in this Journey.',label:'Explore hotels',href:'./hotels.html'});
    if(!all.some(item=>item.type==='Flight'&&isProtected(item)))gaps.push({title:'Arrival still to confirm',detail:'There is no confirmed flight in this Journey.',label:'Explore flights',href:'./flights.html'});
    const today=all.filter(item=>Number(item.dayIndex||1)===day);
    if(!today.length)gaps.push({title:'Open day',detail:'Add a place or experience to begin shaping this day.',label:'Explore activities',href:'./activities.html'});
    gaps.forEach(gap=>{const row=document.createElement('div');row.className='gap-item';const title=document.createElement('strong');title.textContent=gap.title;const desc=document.createElement('p');desc.textContent=gap.detail;const link=document.createElement('a');link.href=gap.href+'?'+destinationQuery();link.textContent=gap.label+' ↗';row.append(title,desc,link);content.append(row)});
    if(!gaps.length){const p=document.createElement('p');p.textContent='No basic stay, flight or empty-day gaps found. Check timing and reservations with each provider.';p.className='gap-item';content.append(p)}
  };
  const renderDays=()=>{
    const total=dayCount();if(day>total)day=total;
    $('trip-day-count').textContent=`${total} ${total===1?'day':'days'}`;
    const list=$('day-list');list.replaceChildren();
    const all=cards().filter(belongs);
    for(let n=1;n<=total;n++){
      const count=all.filter(item=>Number(item.dayIndex||1)===n).length;
      const button=document.createElement('button');button.type='button';button.className='day-tab'+(n===day?' active':'');button.setAttribute('aria-pressed',String(n===day));
      const words=document.createElement('span');const strong=document.createElement('strong');strong.textContent=`Day ${n}`;const small=document.createElement('small');small.textContent=dateFor(n)?displayDate(dateFor(n)):'Flexible date';words.append(strong,small);
      const badge=document.createElement('b');badge.textContent=String(count);button.append(words,badge);
      button.addEventListener('click',()=>{day=n;render()});list.append(button);
    }
  };
  const renderCards=()=>{
    const all=cards(),list=$('activity-list');list.replaceChildren();
    const selected=all.map((item,index)=>({item,index})).filter(({item})=>belongs(item)&&Number(item.dayIndex||1)===day);
    $('active-day-label').textContent=`DAY ${String(day).padStart(2,'0')}`;
    $('active-day-title').textContent=day===1?'The first chapter':day===dayCount()?'The next chapter begins':'Make the day your own';
    $('active-day-date').textContent=displayDate(dateFor(day));
    $('active-day-total').textContent=`${selected.length} ${selected.length===1?'card':'cards'}`;
    if(!selected.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<strong>No Activity Cards on this day yet.</strong><p>Add one of your own or choose Add to Journey in the Travel Store. Your saved choices will appear here.</p>';list.append(empty);return}
    selected.forEach(({item,index},order)=>{
      const article=document.createElement('article');article.className='activity-card type-'+String(item.type||'other').toLowerCase().replace(/[^a-z]+/g,'-');article.dataset.cardIndex=String(index);
      const number=document.createElement('div');number.className='card-index';number.textContent=String(order+1).padStart(2,'0');
      const info=document.createElement('div');const title=document.createElement('h4');title.textContent=safeText(item.title||'Untitled plan');
      const meta=document.createElement('p');meta.className='card-meta';meta.textContent=[item.time||'',item.type||'Plan',item.location||setup.destination].filter(Boolean).join(' · ');
      const source=document.createElement('p');source.className='card-source';source.textContent=item.source?`Source: ${item.source}`:'Added by you';
      const status=document.createElement('span');status.className='card-status'+(isProtected(item)?' booked':'');status.textContent=isProtected(item)?'Booking reported · check provider proof':item.status==='idea'?'Saved idea · not booked':'Planned · not booked';
      info.append(title,meta,source,status);
      const controls=document.createElement('div');controls.className='card-controls';
      if(!isProtected(item)){
        const move=document.createElement('select');move.setAttribute('aria-label',`Move ${title.textContent} to a day`);
        for(let n=1;n<=dayCount();n++){const option=document.createElement('option');option.value=String(n);option.textContent=`Day ${n}`;option.selected=n===day;move.append(option)}
        move.addEventListener('change',()=>{const current=cards();if(!current[index]||isProtected(current[index]))return;current[index].dayIndex=Number(move.value);current[index].date=dateFor(Number(move.value));saveCards(current);render()});
        const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${title.textContent} from the Journey`);
        remove.addEventListener('click',()=>{const current=cards();if(!current[index]||isProtected(current[index]))return;current.splice(index,1);saveCards(current);render()});
        controls.append(move,remove);
      }else{const fixed=document.createElement('span');fixed.className='card-source';fixed.textContent='Booked anchor';controls.append(fixed)}
      article.append(number,info,controls);article.addEventListener('click',event=>{if(event.target.closest('button,select'))return;showCard(index)});list.append(article);
    });
  };
  const renderNotes=()=>{
    const notes=read(notesKey,{});$('day-note').value=safeText(notes[setup.destination+'|'+day]||'');
  };
  const render=()=>{syncLinks();renderDays();renderCards();renderNotes();renderMap();renderGaps()};
  $('journey-destination').value=setup.destination;$('journey-start').value=setup.start;$('journey-end').value=setup.end;$('journey-travelers').value=String(setup.travelers);
  $('journey-setup').addEventListener('submit',event=>{
    event.preventDefault();
    const next={destination:$('journey-destination').value.trim(),start:$('journey-start').value,end:$('journey-end').value,travelers:Number($('journey-travelers').value)};
    if((next.start&&!next.end)||(!next.start&&next.end)){$('setup-message').textContent='Choose both trip dates, or leave both empty while you plan.';return}
    if(next.start&&next.end&&next.end<next.start){$('setup-message').textContent='The last day must be on or after the first day.';return}
    if(next.start&&next.end&&Math.round((utcDate(next.end)-utcDate(next.start))/86400000)>29){$('setup-message').textContent='This preview supports up to 30 trip days. Shorten the date range to continue.';return}
    Object.assign(setup,next);day=1;
    $('setup-message').textContent=write(setupKey,setup)?'Journey details saved in this browser.':'Browser storage is unavailable; changes may be lost on refresh.';
    render();
  });
  $('day-note').addEventListener('input',()=>{const notes=read(notesKey,{});notes[setup.destination+'|'+day]=$('day-note').value;$('note-status').textContent=write(notesKey,notes)?'Saved in this browser.':'Could not save this note.'});
  const dialog=$('card-dialog'),form=$('card-form');
  const close=()=>dialog.close();
  $('add-card').addEventListener('click',()=>{
    form.reset();const select=$('card-day');select.replaceChildren();
    for(let n=1;n<=dayCount();n++){const option=document.createElement('option');option.value=String(n);option.textContent=`Day ${n}`;option.selected=n===day;select.append(option)}
    dialog.showModal();form.elements.namedItem('title').focus();
  });
  $('close-card').addEventListener('click',close);$('cancel-card').addEventListener('click',close);
  form.addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(form);const title=safeText(data.get('title')).trim();if(!title)return;
    const targetDay=Number(data.get('day'))||day;
    const all=cards();all.push({id:'local-'+(crypto.randomUUID?.()||Date.now()),title,type:safeText(data.get('type')),location:safeText(data.get('location')).trim()||setup.destination,journeyDestination:setup.destination,time:safeText(data.get('time')),date:dateFor(targetDay),dayIndex:targetDay,source:'TourGuid manual entry',status:'planned',reservationRef:null});
    saveCards(all);day=targetDay;close();render();
  });
  window.addEventListener('storage',event=>{if([cardKey,setupKey,notesKey].includes(event.key))render()});
  render();
})();
