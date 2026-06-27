const o={};function n(t){return t&&t.split("@")[0].split(/[._-]/).filter(Boolean).map(e=>{var i;return`${((i=e[0])==null?void 0:i.toUpperCase())??""}${e.slice(1)}`}).join(" ")||"Virly user"}function r(t){var e;return((e=t.trim()[0])==null?void 0:e.toUpperCase())??"V"}function s(t){const i=`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="18" y1="18" x2="142" y2="142" gradientUnits="userSpaceOnUse">
          <stop stop-color="#35858E"/>
          <stop offset="0.62" stop-color="#7DA78C"/>
          <stop offset="1" stop-color="#C2D099"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#35858E" flood-opacity="0.24"/>
        </filter>
      </defs>
      <rect width="160" height="160" rx="80" fill="url(#bg)" filter="url(#shadow)"/>
      <circle cx="116" cy="36" r="34" fill="#E6EEC9" opacity="0.26"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Aptos, Segoe UI, sans-serif" font-size="72" font-weight="800" fill="#F9FFE8">${r(t)}</text>
    </svg>
  `;return`data:image/svg+xml,${encodeURIComponent(i)}`}function l(t){return(o==null?void 0:o.VITE_USER_AVATAR_URL)||s(t)}export{n as a,r as b,l as g};
