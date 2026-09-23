const landingDestination=new URLSearchParams(location.search).get('destination')||window.TourGuidDestination?.name||'Barcelona';
const formMessages={
  'flight-search':()=>{const origin=document.getElementById('from').value.trim().toUpperCase();const depart=document.getElementById('depart').value;const ret=document.getElementById('return').value;if(ret&&ret<depart)return 'Return date must be after departure.';return `Route set: ${origin} to ${landingDestination} on ${depart}. Live Duffel offers require the TourGuid server connection.`},
  'hotel-search':()=>{const a=document.getElementById('checkin').value,b=document.getElementById('checkout').value;if(b<=a)return 'Check-out must be after check-in.';return `${landingDestination} stay set: ${a} to ${b}. A booking provider confirms current rates and availability.`},
  'activity-search':()=>{const interest=document.getElementById('interest').value;return `${interest} selected. Live Viator product search requires the TourGuid server connection.`},
  'food-search':()=>{const kind=document.getElementById('food-type').value;return `${kind} selected. Reservation times require approved provider access.`},
  'place-search':()=>{const area=document.getElementById('area').value,kind=document.getElementById('kind').value;return `${kind} in ${area} selected. Current place results require the TourGuid Places connection.`}
};
for(const [id,getMessage] of Object.entries(formMessages)){const form=document.getElementById(id);if(!form)continue;form.addEventListener('submit',event=>{event.preventDefault();document.getElementById(id.replace('-search','-status')).textContent=getMessage()})}
