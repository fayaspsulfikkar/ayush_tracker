/**
 * Node.js / headless test environment shims for Ayush_Tracker unit tests.
 * Keeps browser-only production app.js free of mock DOM and mock IndexedDB code.
 */

function createDummyEl() {
  const el = {
    textContent: '',
    innerHTML: '',
    style: {},
    classes: new Set(),
    children: [],
    childNodes: [],
    attributes: {},
    classList: {
      add(c) { el.classes.add(c); },
      remove(c) { el.classes.delete(c); },
      toggle(c, force) {
        if (typeof force === 'boolean') {
          if (force) el.classes.add(c);
          else el.classes.delete(c);
          return force;
        }
        if (el.classes.has(c)) {
          el.classes.delete(c);
          return false;
        }
        el.classes.add(c);
        return true;
      },
      contains(c) { return el.classes.has(c); }
    },
    addEventListener: () => { },
    removeEventListener: () => { },
    appendChild(c) {
      if (c && typeof c === 'object') c.parentNode = el;
      el.children.push(c);
      return c;
    },
    removeChild(c) {
      const i = el.children.indexOf(c);
      if (i >= 0) el.children.splice(i, 1);
      if (c && typeof c === 'object') c.parentNode = null;
      return c;
    },
    prepend(c) {
      if (c && typeof c === 'object') c.parentNode = el;
      el.children.unshift(c);
    },
    remove() {
      if (el.parentNode && el.parentNode.removeChild) {
        el.parentNode.removeChild(el);
      }
    },
    parentNode: null,
    setAttribute(k, v) { el.attributes[k] = String(v); },
    getAttribute(k) { return el.attributes[k] ?? ''; },
    removeAttribute(k) { delete el.attributes[k]; },
    querySelector: () => createDummyEl(),
    querySelectorAll: () => [],
    value: '',
    checked: false,
    disabled: false,
    focus: () => { },
    blur: () => { },
  };
  Object.defineProperty(el, 'lastChild', {
    get() { return el.children[el.children.length - 1] || null; }
  });
  Object.defineProperty(el, 'firstChild', {
    get() { return el.children[0] || null; }
  });
  return el;
}

function createMockIndexedDB() {
  const mockStores = new Map();
  const rwQueues = new Map();
  const getStoreMap = (storeName) => {
    if (!mockStores.has(storeName)) mockStores.set(storeName, new Map());
    return mockStores.get(storeName);
  };
  const enqueueRw = (key, fn) => {
    const prev = rwQueues.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    rwQueues.set(key, next);
    return next;
  };

  return {
    open(name, version) {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: {
          name,
          version,
          objectStoreNames: { contains: () => true },
          createObjectStore(storeName) {
            getStoreMap(storeName);
            return { createIndex: () => { } };
          },
          transaction(stores, mode) {
            const storeList = Array.isArray(stores) ? stores : [stores];
            const primaryStore = storeList[0] || 'sessions';
            const tx = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              _pending: 0,
              _ready: false,
              _aborted: false,
              _scheduleFinish() {
                if (tx._ready && tx._pending === 0 && !tx._aborted) {
                  if (tx.oncomplete) tx.oncomplete();
                }
              },
              abort() {
                tx._aborted = true;
                if (tx.onabort) tx.onabort();
              },
              objectStore(storeName) {
                const storeMap = getStoreMap(storeName);
                const runOp = (exec) => {
                  const r = { onsuccess: null, onerror: null, result: undefined };
                  tx._pending++;
                  const execute = () => {
                    if (tx._aborted) {
                      tx._pending--;
                      return;
                    }
                    try {
                      r.result = exec();
                      if (r.onsuccess) r.onsuccess({ target: r });
                    } catch (err) {
                      r.error = err;
                      tx.error = err;
                      if (r.onerror) r.onerror({ target: r });
                      if (tx.onerror) tx.onerror({ target: r });
                    } finally {
                      tx._pending--;
                      tx._scheduleFinish();
                    }
                  };
                  if (mode === 'readwrite') {
                    tx._gate.then(() => setTimeout(execute, 0));
                  } else {
                    setTimeout(execute, 0);
                  }
                  return r;
                };
                return {
                  get(key) { return runOp(() => storeMap.get(key) ?? null); },
                  getAll() { return runOp(() => Array.from(storeMap.values())); },
                  put(val) { return runOp(() => { storeMap.set(val.id, val); return val.id; }); },
                  delete(key) { return runOp(() => { storeMap.delete(key); return undefined; }); },
                  clear() { return runOp(() => { storeMap.clear(); return undefined; }); },
                  count() { return runOp(() => storeMap.size); },
                };
              }
            };
            if (mode === 'readwrite') {
              let unlockTx;
              const gateDone = new Promise((res) => { unlockTx = res; });
              let startResolve;
              tx._gate = new Promise((res) => { startResolve = res; });
              enqueueRw(primaryStore, () => {
                startResolve();
                return gateDone;
              });
              const origFinish = tx._scheduleFinish;
              tx._scheduleFinish = () => {
                if (tx._ready && tx._pending === 0) {
                  unlockTx();
                }
                origFinish();
              };
              const origAbort = tx.abort;
              tx.abort = () => {
                unlockTx();
                origAbort();
              };
              setTimeout(() => { tx._ready = true; tx._scheduleFinish(); }, 0);
            } else {
              tx._gate = Promise.resolve();
              setTimeout(() => { tx._ready = true; tx._scheduleFinish(); }, 0);
            }
            return tx;
          },
          close() { }
        }
      };
      setTimeout(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 0);
      return req;
    }
  };
}

function installNodeShims(target = globalThis) {
  if (typeof target.document === 'undefined') {
    const byId = new Map();
    target.document = {
      getElementById: (id) => {
        if (!byId.has(id)) byId.set(id, createDummyEl());
        return byId.get(id);
      },
      querySelector: () => createDummyEl(),
      querySelectorAll: () => [],
      createElement: () => createDummyEl(),
      addEventListener: () => { },
      removeEventListener: () => { },
      hidden: false,
      activeElement: null,
      documentElement: { setAttribute: () => { }, getAttribute: () => 'light', classList: { add: () => { }, remove: () => { } } },
      body: { appendChild: () => { }, removeChild: () => { }, classList: { add: () => { }, remove: () => { } } },
      readyState: 'complete',
      styleSheets: [],
    };
  }
  if (typeof target.window === 'undefined') {
    target.window = {
      addEventListener: () => { },
      removeEventListener: () => { },
      location: { search: '' },
      localStorage: {
        _data: {},
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; },
        clear() { this._data = {}; }
      }
    };
  }
  if (typeof target.localStorage === 'undefined') {
    target.localStorage = target.window.localStorage;
  }
  if (typeof target.navigator === 'undefined') {
    target.navigator = {
      userAgent: 'node',
      serviceWorker: { register: () => Promise.resolve() }
    };
  }
  if (typeof target.confirm === 'undefined') {
    target.confirm = () => true;
  }
  if (typeof target.indexedDB === 'undefined') {
    target.indexedDB = createMockIndexedDB();
  }
  return target;
}

module.exports = {
  createDummyEl,
  createMockIndexedDB,
  installNodeShims,
};

