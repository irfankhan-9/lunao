import fs from 'fs';

const html = fs.readFileSync('sites/summit-befrnfarber-hub-austin/index.html', 'utf8');

// Find the last inline script tag
const lastScriptTag = html.lastIndexOf('<script>');
if (lastScriptTag !== -1) {
  const scriptContent = html.slice(lastScriptTag);
  console.log(scriptContent.slice(Math.max(0, scriptContent.length - 2500)));
} else {
  console.log('No inline script found?');
}
