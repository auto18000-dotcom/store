(()=>{
  const id=new URLSearchParams(location.search).get('item');
  const item=window.TourGuidCatalog[id];
  if(!item){document.querySelector('main').textContent='This Travel Store page is unavailable.';return}
  const isIdea=['theme','collection','guide'].includes(item.kind);
  document.title=`${item.title} | TourGuid Travel Store`;
  const values={'#crumb':item.title,'#kind':`${item.type} · ${item.kind}`,'#title':item.title,'#summary':item.summary,'#art-label':item.location,'#status':item.status,'#source':`${item.source} · ${item.url}`,'#location':item.location,'#card-preview':`${item.type} · ${item.title} · ${item.location} · ${isIdea?'Idea':'Planned'}`};
  for(const [selector,value] of Object.entries(values))document.querySelector(selector).textContent=value;
  const list=document.querySelector('#details');
  for(const line of item.details){const li=document.createElement('li');li.textContent=line;list.append(li)}
  const facts=[['Location',item.location],['Provider',item.booking],['Price and availability','Awaiting live offer'],[item.type==='Hotel'?'Rooms and amenities':item.type==='Activity'?'Duration and inclusions':'Specific details','Awaiting approved provider data']];
  for(const [label,value] of facts){const row=document.createElement('div');row.className='detail-fact';const strong=document.createElement('strong');strong.textContent=label;const span=document.createElement('span');span.textContent=value;row.append(strong,span);document.querySelector('#facts').append(row)}
  document.querySelector('#review-policy').textContent='No provider review score, cancellation policy or payment terms are displayed until an approved source supplies them for this item.';
  const provider=document.querySelector('#provider-link');provider.href=item.url;provider.textContent=`${item.action} ↗`;
  provider.addEventListener('click',event=>{if(item.booking==='None')return;event.preventDefault();window.TourGuidJourney.handoffDialog(provider,{title:item.title,type:item.type})});
  document.querySelector('#add-item').addEventListener('click',()=>window.TourGuidJourney.offerDialog({id,title:item.title,type:item.type,source:item.source,location:item.location,kind:item.kind}));
})();
