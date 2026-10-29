# LOCALSITE SALON TEMPLATE 01 — AI PERSONALIZATION MANIFEST
## DO NOT READ THE HTML FILE. READ ONLY THIS DOCUMENT.

---

## YOUR JOB
Personalize the salon template for a new business. Make only the changes listed here.

---

## DATA YOU WILL RECEIVE
1. BUSINESS_NAME — full salon name (e.g. "Maison Aurélie Hair Studio")
2. BUSINESS_NAME_SHORT — short version (e.g. "Maison Aurélie")
3. PHONE_DISPLAY — formatted (e.g. "(310) 555-0193")
4. PHONE_RAW — digits only (e.g. "3105550193")
5. INSTAGRAM_HANDLE — no @ (e.g. "maisonaureliesalon")
6. FACEBOOK_URL — full URL (e.g. "https://facebook.com/maisonaureliesalon")
7. CITY — city and state (e.g. "Los Angeles, CA")

---

## CHANGES TO MAKE IN: `salon-template-01.html`
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

That is all. Do not change anything else.

---

## LOGO (OPTIONAL)
The logo uses CSS circle mark + `{{BUSINESS_NAME_SHORT}}` text, automatically handled above.
If logo image URL provided:
- Find `<!-- LOGO_AREA -->`
- Replace the inner span with: `<img src="URL" alt="{{BUSINESS_NAME}}" style="height:32px;width:auto;object-fit:contain;">`
- For footer (dark bg): add `filter:brightness(0) invert(1)` to the img style

---

## VERIFICATION
- [ ] `<title>` shows real business name
- [ ] Hero heading shows real name
- [ ] Phone number is correct in both Contact and Book sections
- [ ] Instagram handle has no extra @ symbol
- [ ] Facebook URL begins with https://
- [ ] Blog post dates reference real city ({{CITY}} replaced)
- [ ] Search file for `{{` — zero results
- [ ] File opens in browser without errors

## DO NOT CHANGE
Services, prices, team names, bios, reviews, blog content, CSS, colors, fonts, structure, or the filename.
