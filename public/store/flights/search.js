// Flights search PREVIEW. Every airline, time and price below is invented for the demo — this
// never calls a network. It exists to show what a real search will feel like, not to be booked
// from. The one real, working way to book a flight today is the "Continue to Expedia" button
// above, which is unrelated to whatever is typed into this form.
(function () {
  var AIRLINES = ['Aerolane', 'Northwind Air', 'Blue Meridian', 'Capital Skyways', 'Verdant Air'];
  var form = document.getElementById('preview-search');
  var results = document.getElementById('preview-results');
  var stamp = document.getElementById('preview-stamp');
  if (!form || !results) return;

  function fmtTime(h, m) {
    var period = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + period;
  }
  function fmtDuration(mins) {
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  }
  // Deterministic "randomness" from the route + date, so the same search looks the same twice —
  // it is still entirely made up, just not reshuffled on every click.
  function seedFrom(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return function () { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; };
  }

  function renderResults(from, to, depart, travelers) {
    var rnd = seedFrom(from + '|' + to + '|' + depart);
    var rows = [];
    var count = 4;
    for (var i = 0; i < count; i++) {
      var airline = AIRLINES[Math.floor(rnd() * AIRLINES.length)];
      var depH = 6 + Math.floor(rnd() * 15), depM = Math.floor(rnd() * 12) * 5;
      var durMin = 90 + Math.floor(rnd() * 360);
      var arrTotal = depH * 60 + depM + durMin;
      var arrH = Math.floor(arrTotal / 60) % 24, arrM = arrTotal % 60;
      var nextDay = arrTotal >= 24 * 60;
      var stops = rnd() < 0.45 ? 0 : 1;
      var base = 120 + Math.round(rnd() * 480);
      var fare = Math.round(base * 1.01 + 3); // the same "$3 + 1%" shape the brief described, on a SAMPLE base fare
      var perTraveler = fare * Math.max(1, travelers || 1);
      rows.push(
        '<tr>' +
          '<td>' + airline + '</td>' +
          '<td>' + fmtTime(depH, depM) + ' → ' + fmtTime(arrH, arrM) + (nextDay ? ' <span class="hint">+1 day</span>' : '') + '</td>' +
          '<td>' + fmtDuration(durMin) + '</td>' +
          '<td><span class="badge ' + (stops === 0 ? 'ok' : 'soon') + '">' + (stops === 0 ? 'Nonstop' : stops + ' stop') + '</span></td>' +
          '<td class="price">$' + perTraveler.toLocaleString('en-US') + '</td>' +
        '</tr>'
      );
    }
    var now = new Date();
    var hh = now.getHours(), mm = now.getMinutes();
    stamp.textContent = 'Sample results for ' + (from || 'Origin') + ' → ' + (to || 'Destination') +
      ', priced as of ' + fmtTime(hh, mm) + ' — all fares below already include our booking fee, and none of this is real.';
    results.innerHTML =
      '<table class="tbl"><thead><tr><th>Airline</th><th>Departs → Arrives</th><th>Duration</th><th>Stops</th><th>Price, this trip</th></tr></thead>' +
      '<tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="hint">Sample data only. Prices shown are made up for this preview and are not offers. Real availability, prices and booking arrive when live search is connected.</p>';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var from = document.getElementById('pf-from').value.trim();
    var to = document.getElementById('pf-to').value.trim();
    var depart = document.getElementById('pf-depart').value;
    var travelers = parseInt(document.getElementById('pf-travelers').value, 10) || 1;
    renderResults(from, to, depart, travelers);
  });
})();
