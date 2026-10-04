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
  // The Revised Plan sheet (plan.handoff_sheet). Wording is a claim: the sheet says where the person is going and whose terms
  // apply, and says who takes payment, who receives the funds, the terms, the refund path and support ONLY from a registry row
  // whose profile is verified (list_transaction_providers, through /api/store/providers), as labelled facts and never as
  // sentences of our own. There is no "Verified" badge and no "unverified" warning: the presence of the facts is the signal.
  const makeNode=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node};
  const httpsLink=address=>{
    let ok=false;try{const u=new URL(address);ok=u.protocol==='https:'&&!u.username&&!u.password}catch{}
    if(!ok)return null;
    const a=makeNode('a','',address.replace(/^https:\/\//,''));a.href=address;a.target='_blank';a.rel='noopener noreferrer';return a;
  };
  const verifiedFacts=record=>{
    const list=makeNode('dl','handoff-facts');
    const row=(label,...content)=>{const dd=makeNode('dd');dd.append(...content);list.append(makeNode('dt','',label),dd)};
    row('Payment party',record.paymentParty);
    // Who received the money is its own fact, but when it is the payment party the line above already says so, and
    // printing it twice reads as though something unusual were going on.
    const same=(a,b)=>String(a).trim().replace(/\s+/g,' ').toLowerCase()===String(b).trim().replace(/\s+/g,' ').toLowerCase();
    if(record.fundsRecipient&&!same(record.fundsRecipient,record.paymentParty))row('Funds received by',record.fundsRecipient);
    const terms=httpsLink(record.termsUrl);if(terms)row('Terms',...(record.termsVersion?[terms,` (version ${record.termsVersion})`]:[terms]));
    const refunds=httpsLink(record.cancellationUrl);if(refunds)row('Cancellation & refunds',refunds);
    // Support is up to four separate rows, each one a person can act on: phone, email, page, then the address as plain
    // text (a legal fact, not a channel). Nothing is joined, clipped or shortened.
    const support=record.support||{};
    if(support.phone&&/^[+0-9][0-9 ()./-]{5,39}$/.test(support.phone)){const a=makeNode('a','',support.phone);a.href='tel:'+support.phone.replace(/[^0-9+]/g,'');row('Support phone',a)}
    if(support.email&&/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(support.email)){const a=makeNode('a','',support.email);a.href='mailto:'+support.email;row('Support email',a)}
    const supportPage=support.url&&httpsLink(support.url);if(supportPage)row('Support page',supportPage);
    if(support.address)row('Address',support.address);
    return list;
  };
  const sheetHandoff=(raw,url,item,record)=>{
    if(dialog.open)return;
    const host=url.hostname.replace(/^www\./,'');
    const provider=(record&&record.name)||(window.TourGuidSupplier&&window.TourGuidSupplier.name(raw))||host;
    const verified=!!(record&&record.verified);
    // Two reasons to refuse: the registry says no handoff for this provider, or the flag demands a verified profile and there is none.
    const noHandoff=!!(record&&record.handoffEnabled===false);
    const unverified=flag('plan.require_verified_provider')&&!verified;
    const inner=makeNode('div','journey-dialog-inner handoff');
    const actions=makeNode('div','journey-dialog-actions');
    const cancel=makeNode('button','plain','Cancel');cancel.type='button';cancel.id='close-handoff';cancel.addEventListener('click',close);
    if(noHandoff||unverified){
      cancel.textContent='Close';
      inner.append(makeNode('div','kicker','Not available yet'),makeNode('h2','',`${provider} is not available from TourGuid yet`),makeNode('p','',`${unverified&&!noHandoff?'TourGuid has not verified this provider yet. ':''}You can keep planning your Journey in the meantime.`));
      actions.append(cancel);
    }else{
      // A bare provider address (its home page) is not something the person chose, so no item is named for it.
      const browse=url.pathname==='/'&&!url.search;
      const selected=makeNode('p','',item&&item.title&&!browse?`${item.title}${item.type?` · ${item.type}`:''}`:'');selected.id='handoff-selected';
      const go=makeNode('button','primary',`Continue to ${provider} ↗`);go.type='button';go.id='continue-provider';
      // Through the tracked route: it records the referral, then redirects to the provider with the URL unchanged.
      go.addEventListener('click',()=>{window.open('/api/store/go?url='+encodeURIComponent(raw)+'&page='+encodeURIComponent(location.pathname),'_blank','noopener');close()});
      inner.append(makeNode('div','kicker','You are leaving TourGuid'),makeNode('h2','',`Continue to ${provider}`),selected,makeNode('p','',`${provider}'s own terms apply.`),makeNode('p','mini',`You will go to ${host}.`));
      if(verified)inner.append(verifiedFacts(record));
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
  const sheetOn=()=>flag('plan.handoff_sheet')||flag('plan.require_verified_provider');
  // Takes a link element (the hand-written links on the pages) or a URL string (a link built from data).
  const handoffDialog=(target,item)=>{
    const raw=typeof target==='string'?target.trim():target.href;
    let url;try{url=new URL(raw)}catch{return}
    if(sheetOn()){
      const supplier=window.TourGuidSupplier;
      // The registry is asked once per page and has usually answered by now; if it has not, or cannot, the sheet says only where the person is going.
      Promise.resolve(supplier&&supplier.record?supplier.record(raw):null).catch(()=>null).then(record=>sheetHandoff(raw,url,item,record));
      return;
    }
    legacyHandoff(typeof target==='string'?{href:url.href,hostname:url.hostname}:target,item);
  };
  if(sheetOn()&&window.TourGuidSupplier&&window.TourGuidSupplier.warm)window.TourGuidSupplier.warm();
  const addButton=(host,item)=>{if(!host||host.querySelector('.journey-add'))return;const b=document.createElement('button');b.type='button';b.className='journey-add';b.textContent='Add to Journey';b.addEventListener('click',()=>offerDialog(item));host.append(b)};
  const cardItem=(card,type,source)=>({title:card.querySelector('h3')?.textContent?.trim()||'Travel idea',type,source});
  if(document.querySelector('#hotels')){for(const [section,type,source] of [['activities','Activity','Viator'],['food','Food experience','Provider'],['places','Place','Google Maps']])for(const card of document.querySelectorAll(`#${section} .card`))addButton(card.querySelector('.card-actions'),cardItem(card,type,source));}
  const page=location.pathname.split('/').pop();if(['activities.html','food.html','places.html'].includes(page)){const type={ 'activities.html':'Activity','food.html':'Food experience','places.html':'Place'}[page];for(const card of document.querySelectorAll('.cards .card'))addButton(card.querySelector('.card-content'),cardItem(card,type,''))}
  for(const link of document.querySelectorAll('a[href*="viator.com"],a[href*="opentable.com"]')){link.addEventListener('click',event=>{event.preventDefault();const card=link.closest('.card,.panel');const title=card?.querySelector('h3')?.textContent?.trim();handoffDialog(link,title?{title,type:link.hostname.includes('viator')?'Activity':'Food experience'}:null)})}
  window.TourGuidJourney={addButton,offerDialog,handoffDialog,renderJourney};
  renderJourney();
})();
