# LOCALSITE DENTIST TEMPLATE 01 — AI PERSONALIZATION MANIFEST
## DO NOT READ THE HTML FILE. READ ONLY THIS DOCUMENT.

## YOUR JOB
Personalize the dentist template for a new practice. Make only the changes listed here.

## DATA YOU WILL RECEIVE
1. BUSINESS_NAME — full practice name (e.g. "Clarity Dental Studio")
2. BUSINESS_NAME_SHORT — short version (e.g. "Clarity Dental")
3. PHONE_DISPLAY — formatted (e.g. "(646) 555-0182")
4. PHONE_RAW — digits only (e.g. "6465550182")
5. INSTAGRAM_HANDLE — no @ (e.g. "claritydental_nyc")
6. FACEBOOK_URL — full URL (e.g. "https://facebook.com/claritydental")
7. CITY — city and state (e.g. "New York, NY")
8. DOCTOR_NAME — lead dentist (e.g. "Dr. Sarah Kovacs, DDS")

## CHANGES TO MAKE IN: `dentist-template-01.html`
Find and replace every occurrence, case-sensitive:

| Find | Replace with |
|---|---|
| `{{BUSINESS_NAME}}` | BUSINESS_NAME value |
| `{{BUSINESS_NAME_SHORT}}` | BUSINESS_NAME_SHORT value |
| `{{PHONE_DISPLAY}}` | PHONE_DISPLAY value |
| `{{PHONE_RAW}}` | PHONE_RAW value |
| `{{INSTAGRAM_HANDLE}}` | INSTAGRAM_HANDLE value |
| `{{FACEBOOK_URL}}` | FACEBOOK_URL value |
| `{{CITY}}` | CITY value |
| `{{DOCTOR_NAME}}` | DOCTOR_NAME value |

That is all. Do not change anything else.

## LOGO (OPTIONAL)
CSS tooth logo used by default.
If logo image URL provided: find `<!-- LOGO_AREA -->`, replace inner span with:
`<img src="URL" alt="{{BUSINESS_NAME}}" style="height:30px;width:auto;object-fit:contain;">`
Footer (dark bg): add `filter:brightness(0) invert(1)` to img style.

## VERIFICATION
- [ ] `<title>` shows real practice name
- [ ] Hero heading shows real name
- [ ] Emergency banner shows correct phone number
- [ ] All FAQ answers with `{{PHONE_DISPLAY}}` show correct number
- [ ] Blog post dates reference real city
- [ ] Search file for `{{` — zero results
- [ ] File opens in browser without errors

## DO NOT CHANGE
Services, team bios, review text, FAQ answers (except the city/phone variables),
blog content, CSS, colors, fonts, structure, or filename.
