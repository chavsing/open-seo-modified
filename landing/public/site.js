// APP_URL: where the app is deployed (the APP_DOMAIN of the app's deploy).
// Every sign-up and sign-in button reads it, so this is the only place to
// change it.
const APP_URL = "https://app.yourbrand.com";

for (const link of document.querySelectorAll("a[data-app-path]")) {
  link.setAttribute("href", APP_URL + link.getAttribute("data-app-path"));
}

for (const year of document.querySelectorAll("[data-year]")) {
  year.textContent = String(new Date().getFullYear());
}
