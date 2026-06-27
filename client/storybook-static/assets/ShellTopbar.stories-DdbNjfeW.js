import{S as g}from"./ShellTopbar-BlX2gc8M.js";import"./iframe-DZ5yRNij.js";import"./preload-helper-C1FmrZbK.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./CurrencySelector-HvJbon8t.js";import"./animated-text-C45JbJfK.js";import"./utils-DCADjnpI.js";import"./proxy-BzfIBfh9.js";const w={title:"Layout/ShellTopbar",component:g,parameters:{layout:"fullscreen",docs:{description:{component:`The app top bar: wordmark, currency selector, user identity + balance.
 Props-only (the surrounding AppShell passes the live values).`}}},args:{displayName:"Test User",email:"test.user@virly.test",balance:1250,enteredFromAuth:!1}},a={},e={args:{balance:125e4}},r={parameters:{currency:"USD"}};var s,o,t;a.parameters={...a.parameters,docs:{...(s=a.parameters)==null?void 0:s.docs,source:{originalSource:"{}",...(t=(o=a.parameters)==null?void 0:o.docs)==null?void 0:t.source}}};var c,n,p,i,l;e.parameters={...e.parameters,docs:{...(c=e.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    balance: 1250000.0
  }
}`,...(p=(n=e.parameters)==null?void 0:n.docs)==null?void 0:p.source},description:{story:"A high balance, to check the figure doesn't crowd the user block.",...(l=(i=e.parameters)==null?void 0:i.docs)==null?void 0:l.description}}};var m,d,u,y,h;r.parameters={...r.parameters,docs:{...(m=r.parameters)==null?void 0:m.docs,source:{originalSource:`{
  parameters: {
    currency: "USD"
  }
}`,...(u=(d=r.parameters)==null?void 0:d.docs)==null?void 0:u.source},description:{story:"Balance shown in a non-ILS display currency (via the currency provider).",...(h=(y=r.parameters)==null?void 0:y.docs)==null?void 0:h.description}}};const A=["Default","LargeBalance","UsdDisplay"];export{a as Default,e as LargeBalance,r as UsdDisplay,A as __namedExportsOrder,w as default};
