/* Everything a visitor makes stays in their own browser: scripts in localStorage,
   recordings and music in IndexedDB. Nothing is sent anywhere. */

var Store = (function () {
  'use strict';

  var SCRIPTS = 'teleprompter-scripts';
  var DATABASE = 'teleprompter';

  var DEMOS = [
    {
      title: 'Welcome',
      text: [
        'Welcome. This is a teleprompter that runs in your browser.',
        '🟡',
        'Press Space and the text starts moving at a steady speed.',
        '🟡',
        'The ring beside the text holds the line you are reading.',
        '🔴',
        'A yellow circle in your script is a short breath.',
        'A red circle is a longer stop, for when the topic changes.',
        '🔴',
        'Press M to ready the microphone, then Space to record.',
        'Each take stays in your browser, and you can download it as a WAV file.',
        '🔴',
        'Open Settings to add your own logo and colors.'
      ].join('\n')
    },
    {
      title: 'Right to left',
      text: [
        'أهلا، هذا teleprompter يخدم في الـ browser مباشرة.',
        '🟡',
        'النص يقرا من اليمين لليسار، والكلمات بالـ English تبقى في بلاصتها.',
        '🔴',
        'اضغط Space باش تبدا، و M باش تسجّل صوتك.'
      ].join('\n')
    }
  ];

  var opening = null;

  function scripts() {
    var saved = localStorage.getItem(SCRIPTS);

    if (saved === null) {
      var demos = DEMOS.map(function (demo, i) {
        return { id: String(i + 1), title: demo.title, text: demo.text };
      });
      writeScripts(demos);
      return demos;
    }
    return JSON.parse(saved);
  }

  function writeScripts(list) {
    localStorage.setItem(SCRIPTS, JSON.stringify(list));
  }

  function script(id) {
    return scripts().filter(function (item) { return item.id === id; })[0] || null;
  }

  function addScript(title, text) {
    var list = scripts();
    var highest = list.reduce(function (most, item) { return Math.max(most, Number(item.id)); }, 0);
    var id = String(highest + 1);

    list.push({ id: id, title: title, text: text });
    writeScripts(list);
    return id;
  }

  function updateScript(id, title, text) {
    writeScripts(scripts().map(function (item) {
      return item.id === id ? { id: id, title: title, text: text } : item;
    }));
  }

  function deleteScript(id) {
    writeScripts(scripts().filter(function (item) { return item.id !== id; }));
    return takes(id).then(function (list) {
      return Promise.all(list.map(function (take) { return deleteTake(take.id); }));
    });
  }

  function database() {
    if (opening) return opening;
    opening = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DATABASE, 1);

      request.onupgradeneeded = function () {
        var takeStore = request.result.createObjectStore('takes', { keyPath: 'id', autoIncrement: true });
        takeStore.createIndex('script', 'script');
        request.result.createObjectStore('music', { keyPath: 'name' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    return opening;
  }

  /* Runs one request and resolves once the data is really written. */
  function run(name, mode, action) {
    return database().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(name, mode);
        var request = action(transaction.objectStore(name));

        transaction.oncomplete = function () { resolve(request.result); };
        transaction.onerror = transaction.onabort = function () { reject(transaction.error); };
      });
    });
  }

  function takes(id) {
    return run('takes', 'readonly', function (store) {
      return store.index('script').getAll(id);
    });
  }

  function takeCount(id) {
    return run('takes', 'readonly', function (store) {
      return store.index('script').count(id);
    });
  }

  /* Numbered after the highest take, so a deleted number is never reused for a newer take. */
  function addTake(id, blob, seconds) {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

    return takes(id).then(function (list) {
      var highest = list.reduce(function (most, take) { return Math.max(most, take.n); }, 0);
      var take = { script: id, n: highest + 1, seconds: seconds, blob: blob };

      return run('takes', 'readwrite', function (store) { return store.add(take); }).then(function (key) {
        take.id = key;
        return take;
      });
    });
  }

  function deleteTake(key) {
    return run('takes', 'readwrite', function (store) { return store.delete(key); });
  }

  function tracks() {
    return run('music', 'readonly', function (store) { return store.getAllKeys(); });
  }

  function track(name) {
    return run('music', 'readonly', function (store) { return store.get(name); }).then(function (item) {
      return item.blob;
    });
  }

  function addTrack(file) {
    return run('music', 'readwrite', function (store) {
      return store.put({ name: file.name, blob: file });
    });
  }

  function deleteTrack(name) {
    return run('music', 'readwrite', function (store) { return store.delete(name); });
  }

  return {
    scripts: scripts,
    script: script,
    addScript: addScript,
    updateScript: updateScript,
    deleteScript: deleteScript,
    takes: takes,
    takeCount: takeCount,
    addTake: addTake,
    deleteTake: deleteTake,
    tracks: tracks,
    track: track,
    addTrack: addTrack,
    deleteTrack: deleteTrack
  };
})();
