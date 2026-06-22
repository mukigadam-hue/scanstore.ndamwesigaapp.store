import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Polyfill Promise.withResolvers for older browsers/webviews (required by pdfjs-dist v4)
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

createRoot(document.getElementById("root")!).render(<App />);
