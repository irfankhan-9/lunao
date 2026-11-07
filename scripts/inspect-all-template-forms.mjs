import fs from 'fs';

const files = fs.readdirSync('public').filter(f => f.endsWith('.html') && f.includes('template'));
for (const f of files) {
  const c = fs.readFileSync('public/' + f, 'utf8');
  console.log('==============================');
  console.log('FILE:', f);
  const forms = c.match(/<form[\s\S]*?<\/form>/gi) || [];
  forms.forEach((form, i) => {
    console.log(`--- Form #${i + 1} ---`);
    const tags = form.match(/<(?:input|select|textarea)\b[^>]*>/gi) || [];
    tags.forEach(t => console.log('  ', t));
    const options = form.match(/<option\b[^>]*>[\s\S]*?<\/option>/gi) || [];
    console.log('   Options sample:', options.slice(0, 6));
  });
}
