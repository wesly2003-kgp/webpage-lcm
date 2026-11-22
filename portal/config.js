/*
 * LCM Work Portal configuration.
 *
 * API_URL: paste the Google Apps Script Web App URL (ends in /exec) after deploying
 *          portal/backend. While it is empty the portal runs in Preview mode: data lives
 *          only in this browser and sign-in codes are shown on screen instead of emailed.
 */
window.LCM_CONFIG = {
  API_URL: '',
  REFRESH_SECONDS: 60
};
