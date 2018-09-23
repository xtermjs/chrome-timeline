import { timeline } from '.';
import * as fse from 'fs-extra';

async function waitForEnter(msg: string, release: boolean = false): Promise<any> {
  console.log(msg);
  return new Promise(resolve => process.stdin.on('data', () => {
    resolve();
    if (release) {
      process.stdin.end();
    }
  }));
}

timeline({launchOptions: {headless: false}}, async (runner) => {
  const urls = new Set();
  const seen = new Set();
  const error = new Set();
  await runner.page.on('response', async (response) => {
    const url = response.request().url();
    if (seen.has(url)) {
      return;
    }
    console.log('seeing:', url);
    urls.add(url);
    try {
      fse.outputFileSync('static/' + url.split('://')[1], await response.buffer());
      seen.add(url);
    } catch (e) {
      error.add(url);
      console.log(`error while try to get ${url}:\n${e}`);
    }
  });
  await runner.page.setContent(`
  <html>
    <head>
      <title>Extract devtools</title>
    </head>
    <body>
      <div>
      Click the button below to load the inspector.
      It is important to click through all tabs to get a
      hold of the needed assets.
      <br><br>
      When done, press [Enter] in console.
      <br><br>
      <button onclick="__continue()">Load inspector</button>
      </div>
    </body>
  </html>`);
  await runner.remote((done, window) => {
    (window as any).__continue = done;
  });
  await runner.page.goto('chrome-devtools://devtools/bundled/devtools_app.html', {waitUntil: 'networkidle2'});
  await waitForEnter('', true);
  console.log('processed:', seen.size, 'errors:', error);
});
