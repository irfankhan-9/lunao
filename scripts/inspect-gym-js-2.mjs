import fs from 'fs';
const c = fs.readFileSync('public/gym-template-01.html', 'utf8');
const idx = c.indexOf('function handleFormSubmission');
console.log(c.slice(idx + 1500, idx + 3000));
