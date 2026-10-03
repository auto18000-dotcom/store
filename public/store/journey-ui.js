(()=>{
  const key='tourguid-travel-store-journey-prototype-v1';
  const destinationName=new URLSearchParams(location.search).get('destination')||'';
  const read=()=>{try{return JSON.parse(localStorage.getItem(key))||[]}catch{return []}};
  const write=items=>localStorage.setItem(key,JSON.stringify(items));
  const dialog=document.createElement('dialog');dialog.className='journey-dialog';document.body.append(dialog);
  let current=null;
  const close=()=>dialog.close();
  const renderJourney=()=>{const container=document.getElementById('journey-items');if(!container)return;container.replaceChildren();const items=read();const count=document.getElementById('journey-count');if(count)count.textContent=`${items.length} Journey ${items.length===1?'item':'items'}`;if(!items.length){const e=document.createElement('p');e.className='journey-empty';e.textContent='Your Journey preview is empty. Choose Add to Journey on a hotel, activity, food experience or place.';container.append(e);return}for(const item of items){const card=document.createElement('div');card.className='journey-item';const name=document.createElement('strong');name.textContent=item.title;const meta=document.createElement('small');meta.textContent=`Day ${item.dayIndex||1} · ${item.type} · ${item.date||'Date to be chosen'} · ${item.location||destinationName} · ${item.status==='idea'?'Idea':'Planned'}, not booked`;const detail=document.createElement('small');detail.textContent=`${item.source||'Source to be chosen'} · Reservation details pending provider confirmation`;card.append(name,meta,detail);container.append(card)}};
  const saveCandidate=(item,date,dayIndex)=>{const entry=Object.entries(window.TourGuidCatalog||{}).find(([id,x])=>id===item.id||x.title===item.title);const catalog=entry?.[1];const kind=item.kind||catalog?.kind||null;const status=['theme','collection','guide'].includes(kind)?'idea':'planned';const items=read();if(!items.some(x=>x.title===item.title&&x.date===date&&Number(x.dayIndex||1)===dayIndex&&x.journeyDestination===destinationName)){items.push({catalogId:item.id||entry?.[0]||null,title:item.title,type:item.type,kind,location:item.location||catalog?.location||destinationName,journeyDestination:destinationName,date,dayIndex,source:item.source||catalog?.source||'',status,reservationRef:null});write(items)}renderJourney();close();location.href=`./journey-building?destination=${encodeURIComponent(destinationName)}&day=${dayIndex}#planner`};
  const offerDialog=item=>{current=item;dialog.innerHTML=`<div class="journey-dialog-inner"><div class="kicker">TourGuid Journey</div><h2>Add to your Journey</h2><p id="journey-selected"></p><label for="journey-day">Journey day</label><select id="journey-day"><option value="1">Day 1</option><option value="2">Day 2</option><option value="3">Day 3</option></select><label for="journey-date">Preferred date (optional)</label><input id="journey-date" type="date"><p class="mini">This creates a Journey planning card in the local wireframe. It is not a reservation or a payment.</p><div class="journey-dialog-actions"><button type="button" class="primary" id="save-journey">Save to Journey</button><button type="button" class="plain" id="close-journey">Cancel</button></div><p class="mini">Journey creation is subject to product approval. Checkout is not active in this prototype.</p></div>`;dialog.querySelector('#journey-selected').textContent=`${item.title} · ${item.type} · ${item.location||destinationName}`;dialog.querySelector('#save-journey').addEventListener('click',()=>saveCandidate(item,dialog.querySelector('#journey-date').value,Number(dialog.querySelector('#journey-day').value)));dialog.querySelector('#close-journey').addEventListener('click',close);dialog.showModal()};
  const legacyHandoff=(link,item)=>{const href=link.href,provider=link.hostname.replace(/^www\./,'');dialog.innerHTML=`<div class="journey-dialog-inner"><div class="kicker">Two ways to continue</div><h2>Travel independently or build a Journey</h2><p id="handoff-selected"></p><p>Complete any booking and payment on ${provider}. TourGuid can organize your plans in a Journey, but this prototype cannot confirm an external reservation.</p><div class="journey-dialog-actions"><button type="button" class="primary" id="continue-provider">Continue to ${provider} ↗</button><button type="button" class="secondary" id="choose-journey">Preview Journey option</button><button type="button" class="plain" id="close-handoff">Cancel</button></div><p class="mini">Proposed Journey setup. No charge is collected here; the final offer and checkout require approval.</p></div>`;dialog.querySelector('#handoff-selected').textContent=item?`${item.title} · ${item.type}`:'Your travel purchase';dialog.querySelector('#continue-provider').addEventListener('click',()=>{window.open('/api/store/go?url='+encodeURIComponent(href)+'&page='+encodeURIComponent(location.pathname),'_blank','noopener');close()});dialog.querySelector('#choose-journey').addEventListener('click',()=>offerDialog(item||{title:'Trip purchase to add later',type:'Travel',source:provider}));dialog.querySelector('#close-handoff').addEventListener('click',close);dialog.showModal()};
  const flag=name=>!!(window.TourGuidFlags&&window.TourGuidFlags.get(name));
  // The Revised Plan sheet (plan.handoff_sheet). Wording is a claim: this one says where the person is going and whose
  // terms apply, and nothing about who takes payment, because no provider is verified yet. A verified provider's payment
  // party, terms and support route will come from the registry (list_transaction_providers) and only from there.
  const sheetHandoff=(raw,url,item)=>{
    const host=url.hostname.replace(/^www\./,'');
    const provider=(window.TourGuidSupplier&&window.TourGuidSupplier.name(raw))||host;
    const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node};
    const inner=make('div','journey-dialog-inner handoff');
    const actions=make('div','journey-dialog-actions');
    const cancel=make('button','plain','Cancel');cancel.type='button';cancel.id='close-handoff';cancel.addEventListener('click',close);
    if(flag('plan.require_verified_provider')){
      // No provider has a verified profile yet, so with this flag on none can be handed off to.
      cancel.textContent='Close';
      inner.append(make('div','kicker','Not available yet'),make('h2','',`${provider} is not available from TourGuid yet`),make('p','','TourGuid has not verified this provider yet. You can keep planning your Journey in the meantime.'));
      actions.append(cancel);
    }else{
      const selected=make('p','',item&&item.title?`${item.title}${item.type?` · ${item.type}`:''}`:'');selected.id='handoff-selected';
      const go=make('button','primary',`Continue to ${provider} ↗`);go.type='button';go.id='continue-provider';
      // Through the tracked route: it records the referral, then redirects to the provider with the URL unchanged.
      go.addEventListener('click',()=>{window.open('/api/store/go?url='+encodeURIComponent(raw)+'&page='+encodeURIComponent(location.pathname),'_blank','noopener');close()});
      inner.append(make('div','kicker','You are leaving TourGuid'),make('h2','',`Continue to ${provider}`),selected,make('p','',`${provider}'s own terms apply.`),make('p','mini',`You will go to ${host}.`));
      actions.append(go,cancel);
    }
    inner.append(actions);
    // The dialog is shared with the other prompts, so it is named only while this one is open.
    inner.querySelector('h2').id='handoff-title';
    dialog.setAttribute('aria-labelledby','handoff-title');
    dialog.addEventListener('close',()=>dialog.removeAttribute('aria-labelledby'),{once:true});
    dialog.replaceChildren(inner);
    dialog.showModal();
  };
  // Takes a link element (the hand-written links on the pages) or a URL string (a link built from data).
  const handoffDialog=(target,item)=>{
    const raw=typeof target==='string'?target.trim():target.href;
    let url;try{url=new URL(raw)}catch{return}
    if(flag('plan.handoff_sheet')||flag('plan.require_verified_provider')){sheetHandoff(raw,url,item);return}
    legacyHandoff(typeof target==='string'?{href:url.href,hostname:url.hostname}:target,item);
  };
  const addButton=(host,item)=>{if(!host||host.querySelector('.journey-add'))return;const b=document.createElement('button');b.type='button';b.className='journey-add';b.textContent='Add to Journey';b.addEventListener('click',()=>offerDialog(item));host.append(b)};
  const cardItem=(card,type,source)=>({title:card.querySelector('h3')?.textContent?.trim()||'Travel idea',type,source});
  if(document.querySelector('#hotels')){for(const [section,type,source] of [['activities','Activity','Viator'],['food','Food experience','Provider'],['places','Place','Google Maps']])for(const card of document.querySelectorAll(`#${section} .card`))addButton(card.querySelector('.card-actions'),cardItem(card,type,source));}
  const page=location.pathname.split('/').pop();if(['activities.html','food.html','places.html'].includes(page)){const type={ 'activities.html':'Activity','food.html':'Food experience','places.html':'Place'}[page];for(const card of document.querySelectorAll('.cards .card'))addButton(card.querySelector('.card-content'),cardItem(card,type,''))}
  for(const link of document.querySelectorAll('a[href*="viator.com"],a[href*="opentable.com"]')){link.addEventListener('click',event=>{event.preventDefault();const card=link.closest('.card,.panel');const title=card?.querySelector('h3')?.textContent?.trim();handoffDialog(link,title?{title,type:link.hostname.includes('viator')?'Activity':'Food experience'}:null)})}
  window.TourGuidJourney={addButton,offerDialog,handoffDialog,renderJourney};
  renderJourney();
})();
