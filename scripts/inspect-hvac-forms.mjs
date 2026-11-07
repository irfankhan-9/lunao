import fs from 'fs';
['public/hvac-bespoke.html', 'public/hvac-template.html', 'public/hvac-template-02.html'].forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  console.log('=== ' + f + ' ===');
  const forms = c.match(/<form[\s\S]*?<\/form>/gi) || [];
  forms.forEach(form => {
    const action = form.match(/action=["'][^"']*["']/gi);
    const onsubmit = form.match(/onsubmit=["'][^"']*["']/gi);
    console.log({ action, onsubmit });
  });
});
