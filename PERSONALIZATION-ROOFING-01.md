# LOCALSITE ROOFING TEMPLATE 01 — AI PERSONALIZATION MANIFEST
## DO NOT READ THE HTML FILE. READ ONLY THIS DOCUMENT.

## YOUR JOB
Personalize the roofing template for a new business. Make only the listed changes.

## DATA YOU WILL RECEIVE
1. BUSINESS_NAME
2. BUSINESS_NAME_SHORT
3. PHONE_DISPLAY
4. PHONE_RAW
5. INSTAGRAM_HANDLE
6. FACEBOOK_URL
7. CITY
8. YEARS_IN_BUSINESS

## CHANGES IN: `roofing-template-01.html`
Find and replace every occurrence, case-sensitive:

| Find | Replace with |
|---|---|
| `{{BUSINESS_NAME}}` | BUSINESS_NAME |
| `{{BUSINESS_NAME_SHORT}}` | BUSINESS_NAME_SHORT |
| `{{PHONE_DISPLAY}}` | PHONE_DISPLAY |
| `{{PHONE_RAW}}` | PHONE_RAW |
| `{{INSTAGRAM_HANDLE}}` | INSTAGRAM_HANDLE |
| `{{FACEBOOK_URL}}` | FACEBOOK_URL |
| `{{CITY}}` | CITY |
| `{{YEARS_IN_BUSINESS}}` | YEARS_IN_BUSINESS |

That is all. Do not change anything else.

## LOGO (OPTIONAL)
CSS roof triangle used by default.
If logo image URL provided: find `<!-- LOGO_AREA -->`, replace with:
`<img src="URL" alt="{{BUSINESS_NAME}}" style="height:32px;width:auto;object-fit:contain;filter:brightness(0) invert(1);">`

## VERIFICATION
- [ ] Title tag shows real business name
- [ ] Emergency banner shows correct phone
- [ ] Hero headline shows real city
- [ ] Stats show real years in business
- [ ] FAQ answers with phone show correct number
- [ ] Blog dates reference real city
- [ ] Search for `{{` — zero results
- [ ] File opens without errors

## DO NOT CHANGE
Services, warranties, process steps, review text, FAQ answers (except city/phone variables), blog content, CSS, colors, fonts, structure, or filename.
