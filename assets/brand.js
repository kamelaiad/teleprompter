/* The logo and colors each visitor sets in Settings. This loads in the head of every
   page, so the colors are in place before anything is drawn. */

var Brand = (function () {
  'use strict';

  var KEY = 'teleprompter-brand';
  var DEFAULTS = { brand: '#E85D20', background: '#1E1E1E', logo: '' };
  var LIGHT = '#F2F0EA';
  var DARK = '#1E1E1E';
  var READABLE = 4.5;

  var LOGO = '<svg viewBox="0 0 150 26" width="120" role="img" aria-label="kamelaiad" style="overflow:visible"><path d="M1.70,22.84L1.70,2.36" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M10.73,9.88L1.90,18.32" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M4.91,15.22L10.99,22.84" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M28.89,16.36A6.48,6.48 0 0 0 19.18,10.75A6.48,6.48 0 0 0 19.18,21.97A6.48,6.48 0 0 0 28.89,16.36" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M28.89,9.88L28.89,22.84" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M34.75,22.84L34.75,14.20A4.32,4.32 0 0 1 39.07,9.88A4.32,4.32 0 0 1 43.39,14.20L43.39,22.84" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M43.39,14.20A4.32,4.32 0 0 1 47.71,9.88A4.32,4.32 0 0 1 52.03,14.20L52.03,22.84" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M34.75,9.88L34.75,14.20" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M57.72,16.36L70.68,16.36" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M70.68,16.36A6.48,6.48 0 0 0 58.22,13.88A6.48,6.48 0 0 0 68.78,20.94" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M76.54,22.84L76.54,2.36" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M95.52,16.36A6.48,6.48 0 0 0 85.80,10.75A6.48,6.48 0 0 0 85.80,21.97A6.48,6.48 0 0 0 95.52,16.36" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M95.52,9.88L95.52,22.84" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M101.37,22.84L101.37,9.88" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M120.19,16.36A6.48,6.48 0 0 0 110.47,10.75A6.48,6.48 0 0 0 110.47,21.97A6.48,6.48 0 0 0 120.19,16.36" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M120.19,9.88L120.19,22.84" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M138.68,16.36A6.48,6.48 0 0 0 128.96,10.75A6.48,6.48 0 0 0 128.96,21.97A6.48,6.48 0 0 0 138.68,16.36" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <path d="M138.68,2.36L138.68,22.84" fill="none" style="stroke:var(--logo-la)" stroke-width="3.40" stroke-linecap="round" stroke-linejoin="round"/> <circle cx="101.37" cy="4.09" r="2.11" style="fill:var(--logo-la)"/><circle cx="146.8" cy="4.7" r="2.3" fill="none" style="stroke:var(--logo-ring)" stroke-width="1.9"/></svg>';

  function read() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)));
    } catch (error) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function write(values) {
    localStorage.setItem(KEY, JSON.stringify(values));
    apply();
  }

  function channels(hex) {
    return [1, 3, 5].map(function (at) { return parseInt(hex.slice(at, at + 2), 16); });
  }

  function luminance(hex) {
    var linear = channels(hex).map(function (value) {
      var part = value / 255;
      return part <= 0.03928 ? part / 12.92 : Math.pow((part + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrast(first, second) {
    var a = luminance(first);
    var b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function clearest(background) {
    return contrast(background, LIGHT) >= contrast(background, DARK) ? LIGHT : DARK;
  }

  function mix(from, to, amount) {
    var target = channels(to);
    return '#' + channels(from).map(function (value, i) {
      var part = Math.round(value + (target[i] - value) * amount).toString(16);
      return part.length < 2 ? '0' + part : part;
    }).join('');
  }

  /* Any color can be picked, so text in the brand color moves toward the page's
     text color until it can still be read. */
  function brandText(brand, background, ink) {
    var color = brand;

    for (var amount = 0.1; amount <= 1 && contrast(color, background) < READABLE; amount += 0.1) {
      color = mix(brand, ink, amount);
    }
    return color;
  }

  function apply() {
    var values = read();
    var root = document.documentElement.style;
    var ink = clearest(values.background);

    root.setProperty('--brand', values.brand);
    root.setProperty('--on-brand', clearest(values.brand));
    root.setProperty('--brand-text', brandText(values.brand, values.background, ink));
    root.setProperty('--bg', values.background);
    root.setProperty('--ink', ink);
    showFavicon(values.brand);
  }

  function showFavicon(color) {
    var icon = document.querySelector('link[rel="icon"]');
    var ring = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="' + color + '" stroke-width="6"/></svg>';

    if (icon) icon.href = 'data:image/svg+xml,' + encodeURIComponent(ring);
  }

  function showLogo() {
    var logo = read().logo;

    document.querySelectorAll('[data-logo]').forEach(function (place) {
      place.textContent = '';
      if (logo) {
        var image = new Image();
        image.src = logo;
        image.alt = 'Logo';
        place.appendChild(image);
      } else {
        place.innerHTML = LOGO;
      }
    });
  }

  apply();

  return { DEFAULTS: DEFAULTS, read: read, write: write, showLogo: showLogo };
})();
