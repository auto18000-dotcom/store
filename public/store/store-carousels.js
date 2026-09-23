(()=>{
  const context=new URLSearchParams(location.search);
  const categoryHref=page=>{const url=new URL(`./${page}`,location.href);for(const key of ['destination','from','to'])if(context.has(key))url.searchParams.set(key,context.get(key));return `${url.pathname.split('/').pop()}${url.search?url.search:''}`};
  const categories={
    hotels:{page:'hotels.html',name:'Hotels',description:'Browse stays, compare neighborhoods, and open hotel details.',themes:[
      ['Waterfront stays','Find a base close to the coast and open spaces.','visual-water'],
      ['Central city stays','Explore hotels near major sights and transit.','visual-city'],
      ['Family stays','Compare location and room needs for a shared trip.','visual-hotel'],
      ['Design and boutique stays','Browse smaller properties with a distinct setting.','visual-city']
    ]},
    activities:{page:'activities.html',name:'Experiences',description:'Explore activities by interest, timing, and meeting point.',themes:[
      ['Food and culture','Explore guided tastings and local traditions.','visual-food'],
      ['Art and museums','Make space for galleries, collections, and exhibits.','visual-city'],
      ['Walking experiences','Find a route that fits the pace of the day.','visual-activity'],
      ['Outdoor experiences','Browse activities shaped by the destination.','visual-water']
    ]},
    food:{page:'food.html',name:'Food experiences',description:'Explore dining, tastings, and restaurant planning.',themes:[
      ['Markets and tastings','Explore food markets and tasting experiences.','visual-food'],
      ['Dinner near your stay','Plan a meal around your hotel and daily route.','visual-city'],
      ['Local food walks','Browse food-focused neighborhood experiences.','visual-activity'],
      ['Restaurant discovery','Find dining ideas to check with the provider.','visual-food']
    ]},
    places:{page:'places.html',name:'Places',description:'Browse sights and neighborhoods to shape each Journey day.',themes:[
      ['Historic neighborhoods','Explore streets, squares, and city stories.','visual-city'],
      ['Parks and viewpoints','Build room for open space and city views.','visual-water'],
      ['Arts and architecture','Collect landmarks for a day of discovery.','visual-place'],
      ['Nearby discoveries','Find places that fit around your hotel and route.','visual-city']
    ]}
  };

  for(const [sectionId,config] of Object.entries(categories)){
    const section=document.getElementById(sectionId);
    const track=section?.querySelector(':scope > .grid');
    if(!track||track.children.length<3)continue;
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
    track.insertBefore(category,track.children[2]);

    for(const [title,summary,visualClass] of config.themes){
      const card=document.createElement('a');card.className='carousel-theme-card';card.href=categoryHref(config.page);
      const visual=document.createElement('div');visual.className=`card-visual ${visualClass}`;
      const caption=document.createElement('span');caption.textContent='Explore a theme';visual.append(caption);
      const body=document.createElement('div');body.className='card-body';
      const type=document.createElement('div');type.className='tag';type.textContent=config.name;
      const name=document.createElement('h3');name.textContent=title;
      const copy=document.createElement('p');copy.textContent=summary;
      const linkText=document.createElement('span');linkText.className='theme-action';linkText.textContent=`Explore ${config.name.toLowerCase()} →`;
      body.append(type,name,copy,linkText);card.append(visual,body);track.append(card);
    }

    const controls=document.createElement('div');controls.className='carousel-controls';
    const count=document.createElement('span');count.className='carousel-count';count.setAttribute('aria-live','polite');
    const previous=document.createElement('button');previous.className='carousel-arrow';previous.type='button';previous.textContent='‹';previous.setAttribute('aria-label',`Previous ${config.name.toLowerCase()}`);
    const next=document.createElement('button');next.className='carousel-arrow';next.type='button';next.textContent='›';next.setAttribute('aria-label',`Next ${config.name.toLowerCase()}`);
    controls.append(count,previous,next);track.before(controls);
    const update=()=>{const step=track.children[0].getBoundingClientRect().width+19;const visible=window.matchMedia('(max-width:620px)').matches?1:window.matchMedia('(max-width:900px)').matches?2:3;const start=Math.min(track.children.length-visible,Math.max(0,Math.round(track.scrollLeft/step)));count.textContent=`${start+1}–${Math.min(start+visible,track.children.length)} of ${track.children.length}`;previous.disabled=start===0;next.disabled=start+visible>=track.children.length};
    const move=direction=>{const step=track.children[0].getBoundingClientRect().width+19;track.scrollBy({left:direction*step,behavior:'smooth'})};
    previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();
  }
})();
