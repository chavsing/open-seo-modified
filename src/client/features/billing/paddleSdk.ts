// The slice of Paddle.js v2 the app's checkout uses.
type PaddleEvent = { name?: string };
type PaddleJs = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: {
    token: string;
    eventCallback: (event: PaddleEvent) => void;
  }) => void;
  Checkout: {
    open: (options: {
      items: Array<{ priceId: string; quantity: number }>;
      customer?: { email: string };
      customData: Record<string, string>;
      settings: { displayMode: "overlay"; theme?: "light" | "dark" };
    }) => void;
  };
};
declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

const PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

// Paddle.js can be initialized once per page, so checkout events go through
// one callback to whichever button opened the checkout last.
let listener: ((event: PaddleEvent) => void) | null = null;
let ready: Promise<PaddleJs> | null = null;

export function loadPaddle(config: {
  environment: "production" | "sandbox";
  clientToken: string;
}) {
  ready ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PADDLE_JS_URL;
    script.async = true;
    script.addEventListener("load", () => {
      const paddle = window.Paddle;
      if (!paddle) {
        reject(new Error("Paddle.js loaded without Paddle"));
        return;
      }
      if (config.environment === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({
        token: config.clientToken,
        eventCallback: (event) => listener?.(event),
      });
      resolve(paddle);
    });
    script.addEventListener("error", () =>
      reject(new Error("Paddle.js failed to load")),
    );
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Let the next click try again (an ad blocker turned off, a network
    // blip).
    ready = null;
    document.querySelector(`script[src="${PADDLE_JS_URL}"]`)?.remove();
    throw error;
  });
  return ready;
}

export function onPaddleEvent(callback: (event: PaddleEvent) => void) {
  listener = callback;
}
