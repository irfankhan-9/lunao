import fs from 'fs';

const master = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');

const targets = [
  'Ultra-quiet variable-speed heat pumps, concealed architectural slot diffusers, hospital-grade air purification, and landmark historic ducting delivered with guaranteed upfront pricing.',
  'The deliberate antidote to oversized builder equipment and noisy sheet metal. Founded on the conviction that indoor climate engineering is a high-precision architectural science requiring seamless thermal balance and acoustic silence.',
  'WE DO NOT JUST INSTALL MACHINERY.<br/><span style="color: var(--accent-gold);">WE ENGINEER SILENT INDOOR CLIMATES.</span>',
  '${business.name} was established in ${business.city} to eliminate the traditional friction of loud compressors, uneven hot and cold spots, and poor indoor air quality. We unify mechanical engineering, custom duct acoustics, refrigeration physics, and smart architectural integration under one accountable roof.',
  'From day one, your property is guided by a licensed mechanical engineer and NATE-certified master technician. We perform room-by-room Manual J load calculations, fixed-price contracts with zero surprise change orders, clean-site negative air containment, and sub-micron vacuum decay line tests.',
  'Drag the interactive slider or tap the toggle controls below to observe how loud, corroded mechanical units are replaced by whisper-quiet, surgical inverter installations.',
  'Unsure which heat pump capacity or VRF layout best suits your residence, what clean energy rebates apply, or how to eliminate cold spots? Inquire with our digital engineering advisory desk for instant sizing insights, sound levels, and rebate guidance.',
  'Trimless plaster-in linear slot diffusers, hospital-grade MERV 16 micro-media filter packs, and antique forged brass floor registers available for direct residential delivery.',
  'Authoritative treatises on acoustic airflow design, cold-climate heat pump thermodynamics, indoor air quality science, and historic brownstone preservation.',
  'Describe your heating/cooling requirements, zoning preferences, or desired commissioning window...'
];

targets.forEach((t, i) => {
  console.log(`Target ${i + 1}: ${master.includes(t) ? 'MATCHED' : 'NOT FOUND'}`);
});
