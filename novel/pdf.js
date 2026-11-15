const { chromium } = require('playwright');
(async () => {
  const [,, inp, outp] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + inp, { waitUntil: 'load', timeout: 0 });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: outp, width: '6in', height: '9in', printBackground: false, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;text-align:center;font-family:Georgia,serif;font-size:8px;color:#555"><span class="pageNumber"></span></div>',
    margin: { top: '0.8in', bottom: '0.85in', left: '0.7in', right: '0.7in' }, timeout: 0 });
  await b.close();
})();
