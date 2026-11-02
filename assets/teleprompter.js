/* Teleprompter. Reads one script from this browser and runs it.
   Marks in the script: a line starting with the yellow circle is a breath, the red
   circle is a stop. The last stop becomes the end of the recording. */

(function () {
  'use strict';

  var BREATH = 0.25;
  var STOP = 0.6;
  var GLIDE = 0.28;
  var LEAD_IN = 3;
  var MIN_WPM = 90;
  var MAX_WPM = 280;
  var MIN_SIZE = 32;
  var MAX_SIZE = 110;
  var STORE = 'teleprompter';
  var TAP = 'class Tap extends AudioWorkletProcessor{process(i){if(i[0].length)this.port.postMessage(i[0].map(function(c){return c.slice(0)}));return true}}registerProcessor("tap",Tap)';

  var MARKS = {
    ltr: { breath: 'Breath', stop: 'Stop', end: 'End' },
    rtl: { breath: 'نفس', stop: 'وقف', end: 'النهاية' }
  };

  var ICONS = {
    play: '<svg class="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" transform="rotate(180 12 12)"/></svg>',
    pause: '<svg class="i-pause" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>',
    restart: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 3v5h-5"/></svg>',
    prev: '<svg class="i-flip" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    next: '<svg class="i-flip" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M6 12h12M12 6v12"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 17h.01"/></svg>',
    mic: '<svg class="i-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    stop: '<svg class="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M4 8h9M19 8h1M4 16h1M11 16h9"/><circle cx="16" cy="8" r="3"/><circle cx="8" cy="16" r="3"/></svg>',
    note: '<svg viewBox="0 0 24 24"><circle cx="7" cy="17" r="3"/><circle cx="17" cy="15" r="3"/><path d="M10 17V6l10-2v11"/></svg>'
  };

  var script = Store.script(new URLSearchParams(location.search).get('script'));

  if (!script) {
    location.replace('index.html');
    return;
  }

  var settings = readSettings();
  var wpm = settings.wpm || 165;
  var size = settings.size || 60;
  var title = script.title;
  var scriptName = script.id;
  var rtl = isRtl(script.text);

  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = rtl ? 'ar' : 'en';

  var items = [];
  var segs = [];
  var starts = [];
  var total = 0;
  var segI = 0;
  var frac = 0;
  var playing = false;
  var ended = false;
  var counting = 0;
  var lastFrame = 0;
  var idleTimer = 0;
  var touchY = 0;
  var rec = { armed: false, on: false, stream: null, ctx: null, source: null, node: null, chunks: [], takes: 0, started: 0, timer: 0, level: 0 };

  var mood = { audio: new Audio(), track: '', start: 0, previewing: false };

  mood.audio.volume = settings.moodVolume === undefined ? 0.5 : settings.moodVolume;

  var page = buildPage();
  parse(script.text).forEach(addItem);
  applySize();
  layout();
  render();
  bind();
  loadScripts();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      applySize();
      relayout();
    });
  }

  /* The script decides the reading direction, and the layout follows it. */
  function isRtl(text) {
    var arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
    var latin = (text.match(/[A-Za-z]/g) || []).length;
    return arabic > latin;
  }

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORE)) || {};
    } catch (error) {
      return {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        wpm: wpm,
        size: size,
        mic: settings.mic,
        moodVolume: mood.audio.volume,
        moods: settings.moods,
        moodStarts: settings.moodStarts
      }));
    } catch (error) {
      return;
    }
  }

  function buildPage() {
    document.body.insertAdjacentHTML('beforeend',
      '<header class="top">' +
        '<div class="title"><a class="title-ring" href="index.html" title="All scripts" aria-label="All scripts"></a><select class="switch" aria-label="Change script"></select></div>' +
        '<div class="logo" data-logo></div>' +
      '</header>' +
      '<main class="stage"><div class="column">' +
        '<div class="guide"></div><div class="flow"></div>' +
      '</div></main>' +
      '<div class="count"></div>' +
      '<div class="rec-badge"><i></i><span>Recording</span><b data-show="rec"></b></div>' +
      '<section class="mic" aria-label="Microphone">' +
        '<label>Microphone<select></select></label>' +
        '<div class="meter"><b></b></div>' +
        '<p></p>' +
        '<ol class="takes"></ol>' +
        '<div class="mood">' +
          '<label>Music<select></select></label>' +
          '<div class="mood-tools">' +
            '<button class="btn" type="button" data-mood="preview" title="Listen" aria-label="Listen">' + ICONS.note + '</button>' +
            '<input type="range" min="0" max="1" step="0.05" aria-label="Music volume" title="Music volume">' +
            '<button class="btn" type="button" data-mood="remove" title="Remove this track" aria-label="Remove this track">' + ICONS.close + '</button>' +
          '</div>' +
          '<label class="mood-start" hidden>Start<input type="range" min="0" step="0.5" value="0" aria-label="Music start point"><b>0:00</b></label>' +
          '<button class="mood-add" type="button" data-mood="add">' + ICONS.plus + '<span>Add music: click here or drop a file</span></button>' +
          '<small>Wear headphones so the music stays out of the recording.</small>' +
          '<input type="file" accept="audio/*" multiple hidden>' +
        '</div>' +
      '</section>' +
      '<nav class="bar" aria-label="Controls">' +
        '<div class="progress"><b></b></div>' +
        '<div class="tools">' +
          '<button class="btn play" data-do="toggle" title="Play or pause (Space)" aria-label="Play or pause">' + ICONS.play + ICONS.pause + '</button>' +
          '<button class="btn mic-btn" data-do="mic" title="Record your voice (M)" aria-label="Record your voice">' + ICONS.mic + ICONS.stop + '</button>' +
          '<button class="btn" data-do="prev" title="Previous sentence" aria-label="Previous sentence">' + ICONS.prev + '</button>' +
          '<button class="btn" data-do="next" title="Next sentence" aria-label="Next sentence">' + ICONS.next + '</button>' +
          '<button class="btn" data-do="restart" title="From the start (R)" aria-label="From the start">' + ICONS.restart + '</button>' +
          '<div class="group">' +
            '<button class="btn" data-do="slower" title="Slower" aria-label="Slower">' + ICONS.minus + '</button>' +
            '<div class="value"><b data-show="wpm"></b>words / min</div>' +
            '<button class="btn" data-do="faster" title="Faster" aria-label="Faster">' + ICONS.plus + '</button>' +
          '</div>' +
          '<div class="group">' +
            '<button class="btn" data-do="smaller" title="Smaller text" aria-label="Smaller text">' + ICONS.minus + '</button>' +
            '<div class="value"><b data-show="size"></b>text size</div>' +
            '<button class="btn" data-do="larger" title="Larger text" aria-label="Larger text">' + ICONS.plus + '</button>' +
          '</div>' +
          '<div class="group optional">' +
            '<button class="btn" data-do="full" title="Full screen (F)" aria-label="Full screen">' + ICONS.full + '</button>' +
            '<button class="btn" data-do="help" title="Help (H)" aria-label="Help">' + ICONS.help + '</button>' +
            '<a class="btn" href="settings.html" title="Settings" aria-label="Settings">' + ICONS.settings + '</a>' +
          '</div>' +
          '<div class="time"><b data-show="now"></b> / <span data-show="total"></span></div>' +
        '</div>' +
      '</nav>' +
      '<div class="help"><div class="card" dir="ltr">' +
        '<h2>Controls</h2>' +
        '<dl>' +
          '<dt>Space</dt><dd>Play or pause. While recording it saves that part, and the next press starts a new one</dd>' +
          '<dt>↑ ↓</dt><dd>Faster or slower</dd>' +
          '<dt>← →</dt><dd>Next or previous sentence</dd>' +
          '<dt>+ −</dt><dd>Larger or smaller text</dd>' +
          '<dt>M</dt><dd>Ready the microphone, or stop recording</dd>' +
          '<dt>R</dt><dd>From the start</dd>' +
          '<dt>Scroll</dt><dd>While recording, scrolling back to the top discards the take and starts again</dd>' +
          '<dt>F</dt><dd>Full screen</dd>' +
          '<dt>H</dt><dd>Show this help</dd>' +
        '</dl>' +
        '<p><i></i>Breath: a short breath, then carry on</p>' +
        '<p><i></i>Stop: half a second, the topic changes</p>' +
      '</div></div>');

    document.title = title + ' · Teleprompter';

    return {
      flow: document.querySelector('.flow'),
      guide: document.querySelector('.guide'),
      stage: document.querySelector('.stage'),
      switcher: document.querySelector('.switch'),
      count: document.querySelector('.count'),
      help: document.querySelector('.help'),
      progress: document.querySelector('.progress b'),
      wpm: document.querySelector('[data-show="wpm"]'),
      size: document.querySelector('[data-show="size"]'),
      now: document.querySelector('[data-show="now"]'),
      total: document.querySelector('[data-show="total"]'),
      rec: document.querySelector('[data-show="rec"]'),
      mic: document.querySelector('.mic'),
      micSelect: document.querySelector('.mic select'),
      micNote: document.querySelector('.mic p'),
      meter: document.querySelector('.meter b'),
      takes: document.querySelector('.takes'),
      mood: document.querySelector('.mood'),
      moodSelect: document.querySelector('.mood select'),
      moodVolume: document.querySelector('.mood-tools input[type="range"]'),
      moodFile: document.querySelector('.mood input[type="file"]'),
      moodStartRow: document.querySelector('.mood-start'),
      moodStart: document.querySelector('.mood-start input'),
      moodStartTime: document.querySelector('.mood-start b')
    };
  }

  function loadScripts() {
    Store.scripts().forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.title;
      page.switcher.appendChild(option);
    });
    page.switcher.value = scriptName;
    Brand.showLogo();
  }

  /* Turns the pasted script into a list of text, breath and stop items. */
  function parse(text) {
    var list = [];

    text.split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (line.indexOf('🟡') === 0) list.push({ type: 'breath' });
      else if (line.indexOf('🔴') === 0) list.push({ type: 'stop' });
      else list.push({ type: 'text', text: line });
    });

    while (list.length && list[list.length - 1].type !== 'text') list.pop();
    list.push({ type: 'end' });
    return list;
  }

  function addItem(item) {
    var el;

    if (item.type === 'text') {
      el = document.createElement('p');
      el.className = 'text';
      el.dir = rtl ? 'rtl' : 'ltr';
      if (rtl) fillText(el, item.text);
      else el.textContent = item.text;
      item.words = item.text.split(/\s+/).length;
    } else {
      el = document.createElement('div');
      el.className = 'mark ' + item.type;
      el.innerHTML = '<i></i><span></span>';
      el.lastChild.textContent = MARKS[rtl ? 'rtl' : 'ltr'][item.type];
    }

    item.el = el;
    item.index = items.length;
    items.push(item);
    page.flow.appendChild(el);
  }

  /* Every English run becomes one isolated left-to-right island. The Arabic prefix
     before it and the punctuation after it stay on the same line, so a run is never
     split across two lines and the reading order never changes. */
  function fillText(parent, text) {
    var run = /[A-Za-z0-9]+(?:[\/+&'’.-][A-Za-z0-9]+)*(?:[  ]+[A-Za-z0-9]+(?:[\/+&'’.-][A-Za-z0-9]+)*)*/g;
    var prefix = /(?:^|[  ])((?:[؀-ۿ]*ـ|و|ب|ل)[  ]+)$/;
    var trailing = /^[،؛؟.!:…]+/;
    var last = 0;
    var match;

    while ((match = run.exec(text))) {
      var before = text.slice(last, match.index);
      var lead = before.match(prefix);
      var unit = document.createElement('span');
      var island = document.createElement('span');

      if (lead) before = before.slice(0, before.length - lead[1].length);
      parent.appendChild(document.createTextNode(before));

      unit.className = 'unit';
      if (lead) unit.appendChild(document.createTextNode(lead[1]));

      island.className = 'en';
      island.dir = 'ltr';
      island.textContent = match[0];
      unit.appendChild(island);

      last = match.index + match[0].length;

      var tail = text.slice(last).match(trailing);
      if (tail) {
        unit.appendChild(document.createTextNode(tail[0]));
        last += tail[0].length;
      }

      parent.appendChild(unit);
      run.lastIndex = last;
    }

    parent.appendChild(document.createTextNode(text.slice(last)));
  }

  /* Time drives everything, so speed in words a minute stays true at any font size. */
  function layout() {
    var wordsPerSecond = wpm / 60;

    segs = [];
    items.forEach(function (item, i) {
      var top = item.el.offsetTop;
      var next = i < items.length - 1 ? items[i + 1].el.offsetTop : top;

      if (item.type === 'text') {
        segs.push({ item: i, y0: top, y1: next, dur: Math.max(0.3, item.words / wordsPerSecond) });
      } else if (item.type === 'end') {
        segs.push({ item: i, y0: top, y1: top, dur: 1 });
      } else {
        segs.push({ item: i, y0: top, y1: top, dur: item.type === 'stop' ? STOP : BREATH, hold: true });
        segs.push({ item: i, y0: top, y1: next, dur: GLIDE, glide: true });
      }
    });

    starts = [];
    total = 0;
    segs.forEach(function (seg) {
      starts.push(total);
      total += seg.dur;
    });

    page.total.textContent = clock(total);
    page.wpm.textContent = wpm;
    page.size.textContent = size;
  }

  function relayout() {
    layout();
    render();
  }

  function position() {
    var seg = segs[segI];
    var t = seg.glide ? frac * frac * (3 - 2 * frac) : frac;
    return seg.y0 + (seg.y1 - seg.y0) * t;
  }

  function render() {
    var seg = segs[segI];
    var lineHalf = parseFloat(getComputedStyle(page.flow).getPropertyValue('--size')) || size;
    var readY = page.guide.offsetTop + page.guide.offsetHeight / 2;
    var offset = readY - position() - lineHalf * 0.75;

    page.flow.style.transform = 'translateY(' + offset + 'px)';

    items.forEach(function (item, i) {
      item.el.classList.toggle('now', i === seg.item);
      item.el.classList.toggle('read', i < seg.item);
    });

    page.guide.classList.toggle('hold', Boolean(seg.hold) && items[seg.item].type === 'stop');

    var elapsed = starts[segI] + frac * seg.dur;
    page.progress.style.transform = 'scaleX(' + (total ? elapsed / total : 0) + ')';
    page.now.textContent = clock(elapsed);
  }

  function clock(seconds) {
    var whole = Math.round(seconds);
    var rest = whole % 60;
    return Math.floor(whole / 60) + ':' + (rest < 10 ? '0' : '') + rest;
  }

  function tick(time) {
    if (!playing) return;

    var dt = Math.min(0.1, (time - lastFrame) / 1000);
    lastFrame = time;
    frac += dt / segs[segI].dur;

    while (frac >= 1) {
      if (segI === segs.length - 1) {
        frac = 1;
        finish();
        return;
      }
      frac -= 1;
      frac *= segs[segI].dur / segs[segI + 1].dur;
      segI += 1;
    }

    render();
    requestAnimationFrame(tick);
  }

  function run() {
    playing = true;
    playMood();
    document.body.classList.add('playing');
    lastFrame = performance.now();
    requestAnimationFrame(tick);
    wakeUi();
  }

  function pause() {
    playing = false;
    pauseMood();
    document.body.classList.remove('playing');
    stopCount();
    wakeUi();
  }

  function finish() {
    ended = true;
    render();
    pause();
    if (rec.on) stopRecording();
  }

  function stopCount() {
    clearTimeout(counting);
    counting = 0;
    page.count.classList.remove('on');
  }

  function countdown(left) {
    if (left === 0) {
      stopCount();
      if (rec.armed && !rec.on) startRecording();
      run();
      return;
    }
    page.count.classList.add('on');
    page.count.innerHTML = '<div>' + left + '</div>';
    counting = setTimeout(function () { countdown(left - 1); }, 1000);
  }

  function toggle() {
    if (counting) {
      stopCount();
      return;
    }
    if (playing) {
      pause();
      if (rec.on) stopRecording();
      return;
    }
    if (ended) seek(0, 0);
    if ((rec.armed && !rec.on) || (segI === 0 && frac === 0 && !rec.on)) countdown(LEAD_IN);
    else run();
  }

  function seek(index, fraction) {
    segI = index;
    frac = fraction;
    ended = false;
    render();
  }

  function seekItem(itemIndex) {
    for (var i = 0; i < segs.length; i++) {
      if (segs[i].item === itemIndex) {
        seek(i, 0);
        return;
      }
    }
  }

  function jump(step) {
    var at = segs[segI].item;
    var i = at;

    if (step < 0 && items[at].type === 'text' && frac > 0.15) {
      seekItem(at);
      return;
    }

    for (i += step; i >= 0 && i < items.length; i += step) {
      if (items[i].type === 'text') {
        seekItem(i);
        return;
      }
    }
    if (step < 0) seek(0, 0);
  }

  function nudge(pixels) {
    if (counting) return;

    var target = Math.max(0, position() + pixels);

    if (rec.on && pixels < 0 && target === 0 && performance.now() - rec.started > 1000) {
      restartTake();
      return;
    }

    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (target < seg.y1 || i === segs.length - 1) {
        var span = seg.y1 - seg.y0;
        seek(i, span > 0 ? Math.min(1, Math.max(0, (target - seg.y0) / span)) : 0);
        return;
      }
    }
  }

  function setWpm(value) {
    var fraction = frac;
    wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, value));
    layout();
    frac = fraction;
    render();
    saveSettings();
  }

  /* A run of English cannot wrap, so the type shrinks until the widest run fits. */
  function applySize() {
    var root = document.documentElement;
    var fitted = Math.min(size, window.innerWidth * 0.075);
    var room = page.flow.clientWidth;
    var widest = 0;

    root.style.setProperty('--size', fitted + 'px');
    page.flow.querySelectorAll('.unit').forEach(function (unit) {
      widest = Math.max(widest, unit.getBoundingClientRect().width);
    });
    if (widest > room) root.style.setProperty('--size', fitted * room / widest * 0.98 + 'px');
  }

  function setSize(value) {
    size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, value));
    applySize();
    relayout();
    saveSettings();
  }

  function fullScreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  function setHelp(on) {
    page.help.classList.toggle('on', on);
  }

  /* Voice recording. Audio is captured raw and saved as WAV, which every editor opens.
     Pausing the text keeps recording, so a bad sentence can simply be said again. */
  function toggleMic() {
    if (rec.on) {
      pause();
      stopRecording();
    } else if (rec.armed) {
      releaseMic();
      rec.armed = false;
      document.body.classList.remove('armed');
      showPanel(false);
      pauseMood();
    } else {
      armMic();
    }
  }

  /* The panel takes its own side of the window, so the script reflows beside it. */
  function showPanel(on) {
    page.mic.classList.toggle('on', on);
    document.body.classList.toggle('panel', on);
    applySize();
    relayout();
  }

  function micError(message) {
    showPanel(true);
    page.micSelect.parentNode.hidden = true;
    page.meter.parentNode.hidden = true;
    page.micNote.textContent = message;
  }

  function micTrack() {
    return rec.stream.getAudioTracks()[0];
  }

  function openMic(deviceId) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    }).then(function (stream) {
      releaseMic();
      rec.stream = stream;
      rec.source = rec.ctx.createMediaStreamSource(stream);
      rec.node = new AudioWorkletNode(rec.ctx, 'tap', { numberOfOutputs: 0 });
      rec.node.port.onmessage = onAudio;
      rec.source.connect(rec.node);
    });
  }

  function releaseMic() {
    if (rec.source) rec.source.disconnect();
    if (rec.node) rec.node.port.onmessage = null;
    if (rec.stream) rec.stream.getTracks().forEach(function (track) { track.stop(); });
    rec.source = rec.node = rec.stream = null;
  }

  function prepareAudio() {
    if (rec.ctx) return rec.ctx.resume();
    rec.ctx = new AudioContext();
    return rec.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' })));
  }

  function armMic() {
    if (!navigator.mediaDevices || !window.AudioWorkletNode) {
      micError('Recording needs a recent version of Chrome.');
      return;
    }

    prepareAudio()
      .then(function () {
        return openMic(settings.mic).catch(function () { return openMic(); });
      })
      .then(listMics)
      .then(function () {
        rec.armed = true;
        document.body.classList.add('armed');
        page.micSelect.parentNode.hidden = false;
        page.meter.parentNode.hidden = false;
        showPanel(true);
        page.micNote.textContent = 'Ready. Press Space, and recording starts after the countdown.';
        loadTakes();
        loadMood();
      })
      .catch(function (error) {
        if (error.name === 'NotAllowedError') {
          micError('The browser has no permission. Allow the microphone for this page, then press M again.');
        } else {
          micError('The microphone did not open: ' + error.message);
        }
      });
  }

  /* Labels only exist after permission. The DJI wins unless another mic was chosen. */
  function listMics() {
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      var mics = devices.filter(function (device) { return device.kind === 'audioinput'; });
      var current = micTrack().getSettings().deviceId;
      var dji = mics.filter(function (device) { return /dji|wireless mic|mic mini/i.test(device.label); })[0];

      page.micSelect.textContent = '';
      mics.forEach(function (device) {
        var option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || 'Microphone';
        page.micSelect.appendChild(option);
      });

      if (!settings.mic && dji && dji.deviceId !== current) {
        page.micSelect.value = dji.deviceId;
        return openMic(dji.deviceId);
      }
      page.micSelect.value = current;
    });
  }

  function onAudio(event) {
    var channels = event.data;
    var peak = 0;

    if (rec.on) rec.chunks.push(channels);

    for (var i = 0; i < channels[0].length; i += 8) {
      peak = Math.max(peak, Math.abs(channels[0][i]));
    }
    rec.level = Math.max(peak, rec.level * 0.92);
    page.meter.style.transform = 'scaleX(' + Math.min(1, rec.level * 1.4) + ')';
  }

  function startRecording() {
    rec.chunks = [];
    rec.on = true;
    page.switcher.disabled = true;
    rec.started = performance.now();
    if (segI === 0 && frac === 0) rewindMood();
    document.body.classList.add('recording');
    page.rec.textContent = '0:00';
    rec.timer = setInterval(function () {
      page.rec.textContent = clock((performance.now() - rec.started) / 1000);
    }, 250);
  }

  function endCapture() {
    var chunks = rec.chunks;

    rec.on = false;
    page.switcher.disabled = false;
    rec.chunks = [];
    clearInterval(rec.timer);
    document.body.classList.remove('recording');
    return chunks;
  }

  function stopRecording() {
    var chunks = endCapture();
    if (chunks.length) saveTake(chunks);
    pauseMood();
    wakeUi();
  }

  /* A take gone wrong: nothing is saved, and a new one starts from the top. */
  function restartTake() {
    endCapture();
    pause();
    rewindMood();
    seek(0, 0);
    page.micNote.textContent = 'Take discarded. Starting again.';
    countdown(LEAD_IN);
  }

  /* Music plays in the headphones only. The recording takes the microphone alone,
     so no track ever ends up in a voice file. */
  function moodKey() {
    return scriptName;
  }

  function loadMood(selected) {
    return Store.tracks().then(function (tracks) {
      var saved = selected || (settings.moods || {})[moodKey()] || '';

      page.moodSelect.textContent = '';
      [''].concat(tracks).forEach(function (track) {
        var option = document.createElement('option');
        option.value = track;
        option.textContent = track || 'No music';
        page.moodSelect.appendChild(option);
      });
      page.moodVolume.value = mood.audio.volume;
      page.moodSelect.value = tracks.indexOf(saved) < 0 ? '' : saved;
      return chooseTrack(page.moodSelect.value);
    });
  }

  function chooseTrack(track) {
    pauseMood();
    mood.track = track;
    settings.moods = settings.moods || {};
    settings.moods[moodKey()] = track;
    saveSettings();
    page.moodStartRow.hidden = !track;
    if (!track) return Promise.resolve();

    return Store.track(track).then(function (blob) {
      if (mood.audio.src) URL.revokeObjectURL(mood.audio.src);
      mood.audio.src = URL.createObjectURL(blob);
    });
  }

  function startKey() {
    return moodKey() + '|' + mood.track;
  }

  /* Duration is only known once the track has loaded. */
  function showMoodStart() {
    var saved = (settings.moodStarts || {})[startKey()] || 0;
    var length = isFinite(mood.audio.duration) ? mood.audio.duration : 0;

    mood.start = Math.min(saved, length);
    page.moodStart.max = length;
    page.moodStart.value = mood.start;
    page.moodStartTime.textContent = clock(mood.start);
    rewindMood();
  }

  function setMoodStart(seconds) {
    mood.start = seconds;
    settings.moodStarts = settings.moodStarts || {};
    settings.moodStarts[startKey()] = seconds;
    page.moodStartTime.textContent = clock(seconds);
    if (!rec.on && !playing) rewindMood();
    saveSettings();
  }

  /* The browser's own loop goes back to zero, not to the chosen start. */
  function loopMood() {
    rewindMood();
    mood.audio.play();
  }

  function playMood() {
    if (rec.armed && mood.track) mood.audio.play();
  }

  function pauseMood() {
    mood.previewing = false;
    mood.audio.pause();
  }

  function rewindMood() {
    if (mood.audio.src) mood.audio.currentTime = mood.start;
  }

  function previewMood() {
    if (!mood.track) return;
    if (mood.previewing) {
      pauseMood();
    } else {
      mood.previewing = true;
      rewindMood();
      mood.audio.play();
    }
  }

  function addMood(files) {
    var names = [];

    Array.prototype.reduce.call(files, function (done, file) {
      return done.then(function () {
        if (file.type.indexOf('audio/') !== 0) throw new Error('Not audio');
        return Store.addTrack(file).then(function () { names.push(file.name); });
      });
    }, Promise.resolve())
      .then(function () { return loadMood(names[names.length - 1]); })
      .then(function () {
        page.micNote.textContent = 'Music added: ' + names[names.length - 1];
      })
      .catch(function () {
        page.micNote.textContent = 'That file was not added. Use mp3, wav or m4a.';
      });
  }

  function removeMood() {
    if (!mood.track) return;
    Store.deleteTrack(mood.track).then(function () {
      page.micNote.textContent = 'Music removed.';
      loadMood();
    });
  }

  function loadTakes() {
    Store.takes(scriptName).then(function (takes) {
      page.takes.textContent = '';
      takes.forEach(addTake);
    });
  }

  function addTake(take) {
    var row = document.createElement('li');
    var play = document.createElement('button');
    var audio = new Audio(URL.createObjectURL(take.blob));

    play.type = 'button';
    play.className = 'btn';
    play.innerHTML = ICONS.play;
    play.setAttribute('aria-label', 'Listen');
    play.addEventListener('click', function () {
      if (audio.paused) audio.play();
      else audio.pause();
      play.blur();
    });

    row.appendChild(play);
    row.insertAdjacentHTML('beforeend', '<span>' + take.n + '</span><b>' + clock(take.seconds) + '</b>');
    row.appendChild(takeButton(ICONS.download, 'Download', function () { download(take.blob, title + ' ' + take.n + '.wav'); }));
    row.appendChild(takeButton(ICONS.close, 'Delete', function () { deleteTake(take, row, audio); }));
    page.takes.insertBefore(row, page.takes.firstChild);
  }

  function takeButton(icon, label, action) {
    var button = document.createElement('button');

    button.type = 'button';
    button.className = 'btn';
    button.innerHTML = icon;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', function () {
      action(button);
      button.blur();
    });
    return button;
  }

  function deleteTake(take, row, audio) {
    audio.pause();
    Store.deleteTake(take.id)
      .then(function () {
        row.remove();
        page.micNote.textContent = 'Take ' + take.n + ' deleted.';
      })
      .catch(function () {
        page.micNote.textContent = 'Take ' + take.n + ' was not deleted.';
      });
  }

  function download(blob, name) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
  }

  /* Takes save into this browser. If that fails they go to Downloads, so a good take is never lost. */
  function saveTake(chunks) {
    var wav = toWav(chunks, rec.ctx.sampleRate);
    var seconds = (wav.size - 44) / (rec.ctx.sampleRate * 2);

    Store.addTake(scriptName, wav, seconds)
      .then(function (take) {
        addTake(take);
        page.micNote.textContent = 'Take ' + take.n + ' saved. Space starts the next part.';
      })
      .catch(function () {
        download(wav, title + '.wav');
        page.micNote.textContent = 'This browser could not keep the take, so it went to Downloads.';
      });
  }

  /* One transmitter fills one channel of the stereo receiver, so the louder channel is kept. */
  function toWav(chunks, rate) {
    var energy = [];
    var length = 0;

    chunks.forEach(function (channels) {
      length += channels[0].length;
      channels.forEach(function (samples, c) {
        for (var i = 0; i < samples.length; i += 16) {
          energy[c] = (energy[c] || 0) + Math.abs(samples[i]);
        }
      });
    });

    var best = energy.indexOf(Math.max.apply(null, energy));
    var buffer = new ArrayBuffer(44 + length * 2);
    var view = new DataView(buffer);
    var offset = 44;

    function text(at, value) {
      for (var i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
    }

    text(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    text(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, length * 2, true);

    chunks.forEach(function (channels) {
      var samples = channels[Math.min(best, channels.length - 1)];
      for (var i = 0; i < samples.length; i++) {
        view.setInt16(offset, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
        offset += 2;
      }
    });

    return new Blob([buffer], { type: 'audio/wav' });
  }

  var ACTIONS = {
    toggle: toggle,
    restart: function () {
      if (rec.on) {
        restartTake();
        return;
      }
      pause();
      seek(0, 0);
    },
    mic: toggleMic,
    prev: function () { jump(-1); },
    next: function () { jump(1); },
    slower: function () { setWpm(wpm - 10); },
    faster: function () { setWpm(wpm + 10); },
    smaller: function () { setSize(size - 4); },
    larger: function () { setSize(size + 4); },
    full: fullScreen,
    help: function () { setHelp(!page.help.classList.contains('on')); }
  };

  var KEYS = {
    ' ': 'toggle',
    ArrowUp: 'faster',
    ArrowDown: 'slower',
    ArrowLeft: rtl ? 'next' : 'prev',
    ArrowRight: rtl ? 'prev' : 'next',
    PageDown: 'next',
    PageUp: 'prev',
    '+': 'larger',
    '=': 'larger',
    '-': 'smaller',
    r: 'restart',
    f: 'full',
    h: 'help',
    m: 'mic'
  };

  function wakeUi() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    if (playing) {
      idleTimer = setTimeout(function () { document.body.classList.add('idle'); }, 2000);
    }
  }

  function bind() {
    document.querySelector('.bar').addEventListener('click', function (event) {
      var button = event.target.closest('[data-do]');
      if (!button) return;
      ACTIONS[button.dataset.do]();
      button.blur();
    });

    page.flow.addEventListener('click', function (event) {
      var el = event.target.closest('.text');
      if (!el) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].el === el) seekItem(i);
      }
    });

    page.help.addEventListener('click', function () { setHelp(false); });

    page.switcher.addEventListener('change', function () {
      location.href = 'read.html?script=' + encodeURIComponent(page.switcher.value);
    });

    page.mood.addEventListener('click', function (event) {
      var button = event.target.closest('[data-mood]');
      if (!button) return;
      if (button.dataset.mood === 'preview') previewMood();
      if (button.dataset.mood === 'add') page.moodFile.click();
      if (button.dataset.mood === 'remove') removeMood();
      button.blur();
    });

    /* A file dropped anywhere else must not replace the page and lose the session. */
    ['dragover', 'drop'].forEach(function (type) {
      window.addEventListener(type, function (event) { event.preventDefault(); });
    });

    page.mood.addEventListener('dragover', function () { page.mood.classList.add('over'); });
    page.mood.addEventListener('dragleave', function () { page.mood.classList.remove('over'); });
    page.mood.addEventListener('drop', function (event) {
      page.mood.classList.remove('over');
      addMood(event.dataTransfer.files);
    });

    page.moodSelect.addEventListener('change', function () {
      chooseTrack(page.moodSelect.value);
      page.moodSelect.blur();
    });

    page.moodVolume.addEventListener('input', function () {
      mood.audio.volume = Number(page.moodVolume.value);
      saveSettings();
    });

    page.moodVolume.addEventListener('change', function () { page.moodVolume.blur(); });

    mood.audio.addEventListener('loadedmetadata', showMoodStart);
    mood.audio.addEventListener('ended', loopMood);

    page.moodStart.addEventListener('input', function () {
      setMoodStart(Number(page.moodStart.value));
    });

    page.moodStart.addEventListener('change', function () { page.moodStart.blur(); });

    page.moodFile.addEventListener('change', function () {
      addMood(page.moodFile.files);
      page.moodFile.value = '';
    });

    page.micSelect.addEventListener('change', function () {
      settings.mic = page.micSelect.value;
      saveSettings();
      openMic(settings.mic);
      page.micSelect.blur();
    });

    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        setHelp(false);
        return;
      }
      var action = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!action) return;
      event.preventDefault();
      ACTIONS[action]();
    });

    window.addEventListener('wheel', function (event) {
      nudge(event.deltaY);
    }, { passive: true });

    page.stage.addEventListener('touchstart', function (event) {
      touchY = event.touches[0].clientY;
    }, { passive: true });

    page.stage.addEventListener('touchmove', function (event) {
      nudge(touchY - event.touches[0].clientY);
      touchY = event.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('mousemove', wakeUi);

    window.addEventListener('resize', function () {
      applySize();
      relayout();
    });
  }
})();
