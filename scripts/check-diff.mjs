import fs from 'fs';

const master = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');
const barber = fs.readFileSync('public/templates-raw/barber-template-03.html', 'utf8');

console.log('Master length:', master.length);
console.log('Barber length:', barber.length);
console.log('Difference:', master.length - barber.length);

// Check if closing script tags or router exists
console.log('Barber has </html>:', barber.includes('</html>'));
console.log('Barber has router.route():', barber.includes('router.route()'));
console.log('Barber has renderHome():', barber.includes('renderHome()'));
console.log('Barber has PRODUCTS_DATA:', barber.includes('const PRODUCTS_DATA'));
