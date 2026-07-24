// Browser/WebView compatibility shims that must load before app modules.
// Targeted at old Android WebViews (Chrome < 90) where missing built-ins
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
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

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
  if (typeof (String.prototype as any).replaceAll !== "function") {
    (String.prototype as any).replaceAll = function (search: any, replace: any) {
      if (Object.prototype.toString.call(search) === "[object RegExp]") {
        return this.replace(search, replace);
      }
      return this.split(search).join(replace);
    };
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
