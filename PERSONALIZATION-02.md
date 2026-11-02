# LOCALSITE BARBER TEMPLATE 02 — AI PERSONALIZATION MANIFEST
## Read this fully before making any changes. Do not open or read the HTML file directly.

---

## YOUR JOB

You are personalizing "The Editorial" barbershop website template (Template 02) for a new local business.
You will make exactly the changes listed below. Nothing more. Nothing else.
Every change is described precisely — file name, what to find, what to replace it with.

---

## BUSINESS DATA YOU WILL RECEIVE

You will be given these 7 values:
1. BUSINESS_NAME — the full business name (e.g. "Mike's Barber Shop")
2. BUSINESS_NAME_SHORT — short version for logo (e.g. "Mike's")
3. PHONE_DISPLAY — formatted phone (e.g. "(512) 555-0182")
4. PHONE_RAW — digits only (e.g. "5125550182")
5. INSTAGRAM_HANDLE — username without @ (e.g. "mikesbarber_atx")
6. FACEBOOK_URL — full URL (e.g. "https://facebook.com/mikesbarber")
7. CITY — city and state (e.g. "Austin, TX")

---

## CHANGES TO MAKE IN: `barber-template-02.html`

Perform a find-and-replace for each of the following. Replace ALL occurrences:

| Find (exact text) | Replace with |
|---|---|
| `{{BUSINESS_NAME}}` | The BUSINESS_NAME value |
| `{{BUSINESS_NAME_SHORT}}` | The BUSINESS_NAME_SHORT value |
| `{{PHONE_DISPLAY}}` | The PHONE_DISPLAY value |
| `{{PHONE_RAW}}` | The PHONE_RAW value |
| `{{INSTAGRAM_HANDLE}}` | The INSTAGRAM_HANDLE value |
| `{{FACEBOOK_URL}}` | The FACEBOOK_URL value |
| `{{CITY}}` | The CITY value |

**That is all. Do not change anything else in the file.**

---

## LOGO CUSTOMIZATION (OPTIONAL)

The logo in the top-left of the nav and in the footer uses `{{BUSINESS_NAME_SHORT}}` as text in IBM Plex Mono font. This is automatically personalized by the find-and-replace above.

If the business has provided a logo image URL, additionally:
- Find the element with the comment `<!-- LOGO_AREA -->`
- Replace the text-only logo anchor content with: `<img src="LOGO_URL_HERE" alt="{{BUSINESS_NAME}}" style="height:26px;width:auto;object-fit:contain;">`

If no logo image is provided, leave the text logo as-is after the find-and-replace. It will look professional regardless.

---

## COHERENCE OF SPLIT BUSINESS NAME (CRITICAL)

The Hero features a split editorial text structure:
```html
<h1 class="hero-business-title">
    <span class="title-light">Franklin /</span>
    <span class="title-bold cursor-blink">Franklin & Sons</span>
</h1>
```
When personalizing, split the `{{BUSINESS_NAME}}` string logically at a space.
- The first part before the space should be in the `<span class="title-light">` with a trailing `/`.
- The remaining parts should go into the `<span class="title-bold cursor-blink">` element.
- If the business name has no spaces, place `{{BUSINESS_NAME_SHORT}}` in the light portion and the full `{{BUSINESS_NAME}}` in the bold portion.

---

## VERIFICATION CHECKLIST

After making changes, verify:
- [ ] The browser `<title>` tag contains the real business name, not `{{BUSINESS_NAME}}`
- [ ] The hero split heading displays the components of the real business name neatly
- [ ] The nav logo shows the real short name
- [ ] The phone number in Book Now and Contact sections is correct
- [ ] The Instagram handle in Contact is correct (no extra @ symbol)
- [ ] The Facebook URL is a complete valid URL
- [ ] Search the file for `{{` — there should be zero remaining occurrences
- [ ] The file saves and opens in a browser without errors

---

## WHAT NOT TO CHANGE

- Do not change any services, prices, descriptions, or copy
- Do not change any colors, fonts, or CSS variables
- Do not change review text or reviewer names
- Do not change special offers copy
- Do not change hours of operation
- Do not restructure or reformat any HTML
- Do not add or remove any sections
- Do not rename the file

The template is designed to work perfectly for any barbershop as-is.
Only the parameters above need to be personalized.
