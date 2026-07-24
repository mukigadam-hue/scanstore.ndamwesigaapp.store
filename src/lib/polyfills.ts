// Browser/WebView compatibility shims that must load before app modules.
// Targeted at old Android WebViews where missing built-ins
// cause the whole bundle to crash at parse/execute time.

// --- globalThis (Chrome < 71) ---
try {
  if (typeof (globalThis as any) === "undefined") {
    // eslint-disable-next-line no-new-func
    (0, eval)("var globalThis = (function(){return this||self||window})();");
  }
} catch { /* ignore */ }

// --- Promise.withResolvers (pdf.js v4 requirement, Chrome < 119) ---
if (typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function <T>() {
    let resolveFn: (value: T | PromiseLike<T>) => void = () => undefined;
    let rejectFn: (reason?: any) => void = () => undefined;
    const promise = new Promise<T>((res, rej) => { resolveFn = res; rejectFn = rej; });
    return { promise, resolve: resolveFn, reject: rejectFn };
  };
}

// --- Promise.finally / allSettled (old Android WebView) ---
try {
  if (typeof (Promise.prototype as any).finally !== "function") {
    (Promise.prototype as any).finally = function (onFinally: any) {
      const P = this.constructor || Promise;
      return this.then(
        (value: any) => P.resolve(typeof onFinally === "function" ? onFinally() : onFinally).then(() => value),
        (reason: any) => P.resolve(typeof onFinally === "function" ? onFinally() : onFinally).then(() => { throw reason; })
      );
    };
  }
  if (typeof (Promise as any).allSettled !== "function") {
    (Promise as any).allSettled = function (items: any[]) {
      return Promise.all((items || []).map((p) =>
        Promise.resolve(p).then(
          (value) => ({ status: "fulfilled", value }),
          (reason) => ({ status: "rejected", reason })
        )
      ));
    };
  }
} catch { /* ignore */ }

// --- Array.prototype.at / String.prototype.at (Chrome < 92) ---
try {
  if (typeof (Array.prototype as any).at !== "function") {
    Object.defineProperty(Array.prototype, "at", {
      value: function (n: number) {
        n = Math.trunc(n) || 0;
        if (n < 0) n += this.length;
        if (n < 0 || n >= this.length) return undefined;
        return this[n];
      },
      configurable: true, writable: true,
    });
  }
  if (typeof (Array.prototype as any).includes !== "function") {
    Object.defineProperty(Array.prototype, "includes", {
      value: function (search: any, fromIndex?: number) {
        const len = this.length >>> 0;
        if (len === 0) return false;
        let i = Math.max(fromIndex || 0, 0);
        while (i < len) {
          if (this[i] === search || (this[i] !== this[i] && search !== search)) return true;
          i += 1;
        }
        return false;
      },
      configurable: true, writable: true,
    });
  }
  if (typeof (Array.prototype as any).find !== "function") {
    Object.defineProperty(Array.prototype, "find", {
      value: function (predicate: any, thisArg?: any) {
        for (let i = 0; i < this.length; i += 1) {
          const value = this[i];
          if (predicate.call(thisArg, value, i, this)) return value;
        }
        return undefined;
      },
      configurable: true, writable: true,
    });
  }
  if (typeof (Array.prototype as any).flat !== "function") {
    Object.defineProperty(Array.prototype, "flat", {
      value: function (depth?: number) {
        const d = depth == null ? 1 : Number(depth) || 0;
        const out: any[] = [];
        const walk = (arr: any[], level: number) => {
          for (let i = 0; i < arr.length; i += 1) {
            const value = arr[i];
            if (Array.isArray(value) && level > 0) walk(value, level - 1);
            else out.push(value);
          }
        };
        walk(this, d);
        return out;
      },
      configurable: true, writable: true,
    });
  }
  if (typeof (String.prototype as any).at !== "function") {
    Object.defineProperty(String.prototype, "at", {
      value: function (n: number) {
        n = Math.trunc(n) || 0;
        if (n < 0) n += this.length;
        if (n < 0 || n >= this.length) return undefined;
        return String.prototype.charAt.call(this, n);
      },
      configurable: true, writable: true,
    });
  }
} catch { /* ignore */ }

// --- Object.assign / entries / values (older WebView) ---
try {
  if (typeof (Object as any).assign !== "function") {
    (Object as any).assign = function (target: any, ...sources: any[]) {
      const to = Object(target);
      for (const source of sources) {
        if (source == null) continue;
        for (const key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) to[key] = source[key];
        }
      }
      return to;
    };
  }
  if (typeof (Object as any).entries !== "function") {
    (Object as any).entries = function (obj: any) {
      const out: any[] = [];
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) out.push([key, obj[key]]);
      }
      return out;
    };
  }
  if (typeof (Object as any).values !== "function") {
    (Object as any).values = function (obj: any) {
      return (Object as any).entries(obj).map((entry: any[]) => entry[1]);
    };
  }
} catch { /* ignore */ }

// --- Object.hasOwn (Chrome < 93) ---
try {
  if (typeof (Object as any).hasOwn !== "function") {
    (Object as any).hasOwn = function (obj: any, prop: PropertyKey) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    };
  }
} catch { /* ignore */ }

// --- String.prototype.replaceAll (Chrome < 85) ---
try {
  if (typeof (String.prototype as any).includes !== "function") {
    (String.prototype as any).includes = function (search: string, start?: number) {
      return this.indexOf(search, start || 0) !== -1;
    };
  }
  if (typeof (String.prototype as any).startsWith !== "function") {
    (String.prototype as any).startsWith = function (search: string, pos?: number) {
      return this.substr(pos || 0, search.length) === search;
    };
  }
  if (typeof (String.prototype as any).endsWith !== "function") {
    (String.prototype as any).endsWith = function (search: string, length?: number) {
      const str = String(this);
      const end = length == null ? str.length : Math.min(Number(length) || 0, str.length);
      return str.substring(end - search.length, end) === search;
    };
  }
  if (typeof (String.prototype as any).padStart !== "function") {
    (String.prototype as any).padStart = function (targetLength: number, padString?: string) {
      const str = String(this);
      const pad = String(padString == null ? " " : padString);
      if (str.length >= targetLength || !pad) return str;
      let fill = "";
      while (fill.length < targetLength - str.length) fill += pad;
      return fill.slice(0, targetLength - str.length) + str;
    };
  }
  if (typeof (String.prototype as any).replaceAll !== "function") {
    (String.prototype as any).replaceAll = function (search: any, replace: any) {
      if (Object.prototype.toString.call(search) === "[object RegExp]") {
        return this.replace(search, replace);
      }
      return this.split(search).join(replace);
    };
  }
} catch { /* ignore */ }

// --- DOM convenience APIs that some libraries assume exist ---
try {
  const ElementProto: any = (globalThis as any).Element && (globalThis as any).Element.prototype;
  const NodeListProto: any = (globalThis as any).NodeList && (globalThis as any).NodeList.prototype;
  if (ElementProto && typeof ElementProto.remove !== "function") {
    ElementProto.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
  }
  if (NodeListProto && typeof NodeListProto.forEach !== "function") {
    NodeListProto.forEach = Array.prototype.forEach;
  }
  if (typeof (globalThis as any).CustomEvent !== "function") {
    (globalThis as any).CustomEvent = function (event: string, params?: any) {
      const evt = document.createEvent("CustomEvent");
      evt.initCustomEvent(event, Boolean(params && params.bubbles), Boolean(params && params.cancelable), params && params.detail);
      return evt;
    };
    (globalThis as any).CustomEvent.prototype = (globalThis as any).Event && (globalThis as any).Event.prototype;
  }
} catch { /* ignore */ }

// --- requestAnimationFrame / queueMicrotask fallbacks ---
try {
  if (typeof (window as any).requestAnimationFrame !== "function") {
    (window as any).requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 16);
    (window as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
  }
  if (typeof (globalThis as any).queueMicrotask !== "function") {
    (globalThis as any).queueMicrotask = (cb: any) => Promise.resolve().then(cb).catch((err) => setTimeout(() => { throw err; }, 0));
  }
} catch { /* ignore */ }

// --- structuredClone (Chrome < 98) ---
try {
  if (typeof (globalThis as any).structuredClone !== "function") {
    (globalThis as any).structuredClone = (v: any) => {
      try { return JSON.parse(JSON.stringify(v)); } catch { return v; }
    };
  }
} catch { /* ignore */ }

// --- crypto.randomUUID (Chrome < 92) ---
try {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID !== "function") {
    c.randomUUID = function () {
      const b = new Uint8Array(16);
      (c.getRandomValues ? c.getRandomValues(b) : b.forEach((_: number, i: number) => (b[i] = Math.random() * 256)));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
      return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
    };
  }
} catch { /* ignore */ }

// --- requestIdleCallback (Safari / older WebView) ---
try {
  if (typeof (window as any).requestIdleCallback !== "function") {
    (window as any).requestIdleCallback = (cb: any) =>
      setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1);
    (window as any).cancelIdleCallback = (id: any) => clearTimeout(id);
  }
} catch { /* ignore */ }
