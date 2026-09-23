(()=>{
  const hero=document.querySelector('.hero');
  const credit=document.querySelector('#hero-photo-credit');
  if(!hero||!credit)return;
  const destination=(new URLSearchParams(location.search).get('destination')||'').trim();
  const shade='linear-gradient(90deg,rgba(4,46,55,.87) 0%,rgba(5,77,78,.7) 52%,rgba(5,66,66,.4) 100%)';
  // A slideshow of the destination's photographs, or of travellers when none
  // is chosen. If the service returns nothing the page keeps its own
  // background: never a stand-in photograph.
  const query=new URLSearchParams({count:'6'});
  if(destination)query.set('destination',destination);
  const okPhoto=photo=>photo?.image&&String(photo.image).startsWith('https://images.pexels.com/');
  const loaded=[];
  let index=0,timer=null;
  const draw=photo=>{
    hero.style.backgroundImage=`${shade},url("${photo.image}")`;
    credit.href=photo.page||photo.photographerUrl||'https://www.pexels.com/';
    credit.textContent=`Photo by ${photo.photographer||'a Pexels photographer'} on Pexels`;
    credit.hidden=false;
  };
  const start=()=>{
    if(loaded.length<2||matchMedia('(prefers-reduced-motion: reduce)').matches||timer)return;
    timer=setInterval(()=>{index=(index+1)%loaded.length;draw(loaded[index])},7000);
  };
  fetch(`/api/store/hero-photo?${query}`,{headers:{Accept:'application/json'}})
    .then(response=>response.ok?response.json():null)
    .then(payload=>{
      if(!payload||payload.source!=='pexels_api')return;
      const photos=(Array.isArray(payload.photos)&&payload.photos.length?payload.photos:[payload]).filter(okPhoto);
      photos.forEach(photo=>{
        const image=new Image();
        image.onload=()=>{loaded.push(photo);if(loaded.length===1)draw(photo);start()};
        image.src=photo.image;
      });
    })
    .catch(()=>{});
})();
