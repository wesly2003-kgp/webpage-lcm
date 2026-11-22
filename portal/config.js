/*
 * LCM Work Portal configuration.
 *
 * API_URL: paste the Google Apps Script Web App URL (ends in /exec) after deploying
 *          portal/backend. While it is empty the portal runs in Preview mode: data lives
 *          only in this browser and sign-in codes are shown on screen instead of emailed.
 */
window.LCM_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw5DjYTw2u2-9c3OxdNCBGvHwQvqxN8ALVVzQ2y65q3NPGe_YVtay0OY4KeJo38uNKk/exec',
  REFRESH_SECONDS: 60
};
