(()=>{
  'use strict';
  const planner=document.getElementById('planner');
  if(!planner)return;
  const section=document.createElement('section');
  section.className='wrap profile-section';
  section.id='profile';
  section.setAttribute('aria-labelledby','profile-title');
  section.innerHTML=`
    <div class="profile-intro"><div><div class="kicker">Get to know your travel style</div><h2 id="profile-title">Your traveler profile</h2><p>Tell TourGuid what matters to you. These optional answers can guide future Journey planning and Store recommendations.</p></div><span class="profile-badge">Optional · reusable across Journeys</span></div>
    <form id="profile-form" class="profile-form">
      <div class="profile-column">
        <label class="profile-field">What should we call you?<input name="displayName" maxlength="60" autocomplete="nickname" placeholder="First name or nickname"></label>
        <label class="profile-field">Usual departure airport or city<input name="homeAirport" maxlength="80" placeholder="e.g. San Francisco (SFO)"></label>
        <fieldset class="profile-fieldset"><legend>Who do you usually travel with?</legend><div class="choice-row"><label><input type="radio" name="companions" value="solo"> Solo</label><label><input type="radio" name="companions" value="partner"> Partner</label><label><input type="radio" name="companions" value="family"> Family</label><label><input type="radio" name="companions" value="friends"> Friends</label><label><input type="radio" name="companions" value="varies"> Varies</label></div></fieldset>
        <fieldset class="profile-fieldset"><legend>Your preferred pace</legend><div class="choice-row"><label><input type="radio" name="pace" value="relaxed"> Relaxed</label><label><input type="radio" name="pace" value="balanced"> Balanced</label><label><input type="radio" name="pace" value="full"> Full days</label></div></fieldset>
        <label class="profile-field">Stay preference<select name="stayStyle"><option value="">Choose if you have one</option><option value="central">Central and walkable</option><option value="quiet">Quiet retreat</option><option value="boutique">Boutique and local</option><option value="family">Family friendly</option><option value="luxury">Luxury stay</option><option value="flexible">Flexible</option></select></label>
      </div>
      <div class="profile-column">
        <fieldset class="profile-fieldset"><legend>What draws you to a place?</legend><p>Choose as many as you like.</p><div class="interest-grid"><label><input type="checkbox" name="interests" value="art"> Art &amp; architecture</label><label><input type="checkbox" name="interests" value="food"> Food &amp; drink</label><label><input type="checkbox" name="interests" value="history"> History &amp; culture</label><label><input type="checkbox" name="interests" value="outdoors"> Nature &amp; outdoors</label><label><input type="checkbox" name="interests" value="family"> Family activities</label><label><input type="checkbox" name="interests" value="nightlife"> Nightlife</label><label><input type="checkbox" name="interests" value="wellness"> Wellness</label><label><input type="checkbox" name="interests" value="local"> Local neighborhoods</label></div></fieldset>
        <label class="profile-field">Typical spending style<select name="spendingStyle"><option value="">No preference</option><option value="value">Value minded</option><option value="midrange">Comfortable midrange</option><option value="premium">Premium experiences</option><option value="mixed">A mix, depending on the day</option></select></label>
        <label class="profile-field">Food or accessibility considerations<textarea name="considerations" rows="3" maxlength="400" placeholder="Optional. Share only what you want considered while planning."></textarea></label>
        <p class="profile-privacy">Your answers stay in this browser in the current preview. Do not enter medical records or payment information.</p>
        <div class="profile-actions"><button class="button dark" type="submit">Save my profile</button><button class="button outline" type="button" id="clear-profile">Clear answers</button></div>
        <p class="profile-status" id="profile-status" role="status" aria-live="polite">You can skip any question.</p>
      </div>
    </form>`;
  planner.before(section);
  const key='tourguid-traveler-profile-preview-v1';
  const form=document.getElementById('profile-form');
  const status=document.getElementById('profile-status');
  const read=()=>{try{return JSON.parse(localStorage.getItem(key))||{}}catch{return {}}};
  const choices=new Set(['solo','partner','family','friends','varies']);
  const paces=new Set(['relaxed','balanced','full']);
  const interests=new Set(['art','food','history','outdoors','family','nightlife','wellness','local']);
  const stayStyles=new Set(['central','quiet','boutique','family','luxury','flexible']);
  const spendingStyles=new Set(['value','midrange','premium','mixed']);
  const saved=read();
  form.elements.namedItem('displayName').value=String(saved.displayName||'');
  form.elements.namedItem('homeAirport').value=String(saved.homeAirport||'');
  form.elements.namedItem('considerations').value=String(saved.considerations||'');
  if(stayStyles.has(saved.stayStyle))form.elements.namedItem('stayStyle').value=saved.stayStyle;
  if(spendingStyles.has(saved.spendingStyle))form.elements.namedItem('spendingStyle').value=saved.spendingStyle;
  for(const input of form.querySelectorAll('input[type="radio"]'))input.checked=(input.name==='companions'&&choices.has(saved.companions)&&input.value===saved.companions)||(input.name==='pace'&&paces.has(saved.pace)&&input.value===saved.pace);
  for(const input of form.querySelectorAll('input[name="interests"]'))input.checked=Array.isArray(saved.interests)&&saved.interests.includes(input.value);
  if(saved.savedAt)status.textContent='Your profile was saved in this browser. You can update it at any time.';
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data=new FormData(form);
    const profile={
      schemaVersion:1,
      displayName:String(data.get('displayName')||'').trim(),
      homeAirport:String(data.get('homeAirport')||'').trim(),
      companions:choices.has(data.get('companions'))?data.get('companions'):'',
      pace:paces.has(data.get('pace'))?data.get('pace'):'',
      stayStyle:stayStyles.has(data.get('stayStyle'))?data.get('stayStyle'):'',
      interests:data.getAll('interests').filter(value=>interests.has(value)),
      spendingStyle:spendingStyles.has(data.get('spendingStyle'))?data.get('spendingStyle'):'',
      considerations:String(data.get('considerations')||'').trim(),
      savedAt:new Date().toISOString()
    };
    try{localStorage.setItem(key,JSON.stringify(profile));status.textContent='Profile saved in this browser. Your answers are ready for future planning features.'}
    catch{status.textContent='This browser could not save your profile. Check browser storage and try again.'}
  });
  document.getElementById('clear-profile').addEventListener('click',()=>{
    form.reset();
    try{localStorage.removeItem(key);status.textContent='Profile answers cleared from this browser.'}
    catch{status.textContent='This browser could not clear stored answers.'}
  });
})();
