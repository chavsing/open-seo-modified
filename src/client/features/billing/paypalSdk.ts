import { PAYPAL_CLIENT_ID } from "@/shared/billing";

// The slice of PayPal's JS SDK the app's buttons use.
type PaypalButtons = {
  render: (container: HTMLElement) => Promise<void>;
  close: () => Promise<void>;
};
type PaypalButtonOptions = {
  style: Record<string, string>;
  createSubscription?: (
    data: unknown,
    actions: {
      subscription: {
        create: (input: {
          plan_id: string;
          custom_id: string;
        }) => Promise<string>;
      };
    },
  ) => Promise<string>;
  createOrder?: () => Promise<string>;
  onApprove: (
    data: { subscriptionID?: string | null; orderID?: string | null },
    actions: { restart?: () => Promise<void> },
  ) => Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
};
type PaypalSdk = {
  Buttons: (options: PaypalButtonOptions) => PaypalButtons;
};
declare global {
  interface Window {
    paypal?: PaypalSdk;
    paypalCheckout?: PaypalSdk;
  }
}

// A subscription and a one-time payment need the SDK loaded with different
// settings, so the one-time one lives under its own global name and both can
// sit on the billing page together.
const SDKS = {
  subscription: {
    namespace: "paypal",
    query: "vault=true&intent=subscription",
  },
  checkout: {
    namespace: "paypalCheckout",
    query: "intent=capture&currency=USD",
  },
} as const;

const sdkPromises: Partial<Record<keyof typeof SDKS, Promise<PaypalSdk>>> = {};

/** Loads PayPal's SDK once per page load for each kind of button. */
export function loadPaypalSdk(kind: keyof typeof SDKS): Promise<PaypalSdk> {
  const { namespace, query } = SDKS[kind];
  const loaded = window[namespace];
  if (loaded) return Promise.resolve(loaded);
  sdkPromises[kind] ??= new Promise<PaypalSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&${query}`;
    script.dataset.namespace = namespace;
    if (kind === "subscription") {
      script.dataset.sdkIntegrationSource = "button-factory";
    }
    script.addEventListener("load", () => {
      const sdk = window[namespace];
      if (sdk) resolve(sdk);
      else reject(new Error("PayPal SDK loaded without its namespace"));
    });
    script.addEventListener("error", () => {
      // Let a later visit try again instead of caching the failure.
      delete sdkPromises[kind];
      script.remove();
      reject(new Error("PayPal SDK failed to load"));
    });
    document.head.appendChild(script);
  });
  return sdkPromises[kind];
}

/** PayPal reports a closed payment window as an error in some flows. */
export function isClosedWindowError(error: unknown) {
  return /clos/i.test(error instanceof Error ? error.message : String(error));
}
