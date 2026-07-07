// Browser/WebView compatibility shims that must load before app modules.

// pdfjs-dist v4 expects Promise.withResolvers(), which is missing on many
// older Android WebViews. Load this before any pdf.js imports are evaluated.
if (typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
