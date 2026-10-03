const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('../TASK-015e/browser.cjs');
(async () => {
  const runtime = await start();
  try {
    const { page, context } = await pageFor(runtime, 375, { loggedIn: false });
    console.log('TASK-014 baseline 2026-10-03; commit fe1c834; fixture API, production frontend');
    console.log(JSON.stringify(await page.evaluate(async () => {
      const { DESC, WX } = await import('app/config');
      const { resolveCity, loadCities } = await import('app/cities');
      const { generateReply } = await import('app/chat');
      const advice = await import('app/render');
      await loadCities();
      const loc = { city: 'Wuchang', region: '福建省', country: '中国', lat: 30.586, lon: 114.326 };
      const wx = { current_weather: { temperature: 35, weathercode: 0, windspeed: 8 }, hourly: {}, daily: { time: ['2026-10-03','2026-10-04'], temperature_2m_max:[36,5],temperature_2m_min:[30,-2],weathercode:[0,66] } };
      return { desc: [3,56,57,66,67,77].map(code => [code,DESC(code)]), freezingIsRain: WX.isRain(66), hasIsFreezing: typeof WX.isFreezing, resolvedCity: resolveCity(loc), retainedRegion: loc.region, sunriseSunsetVisible: /日出|日落/.test(document.querySelector('#stats-scroll').textContent), feedbackEntry: !!document.querySelector('#feedback-open'), timestamp: !!document.querySelector('#weather-updated'), lifeSections: document.querySelectorAll('.advice-section').length, tomorrowReply: generateReply('明天怎么穿','北京',wx,advice) };
    }), null, 2));
    await context.close();
  } finally { await runtime.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
