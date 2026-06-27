import{C as g}from"./CurrencySelector-HvJbon8t.js";import"./iframe-DZ5yRNij.js";import"./preload-helper-C1FmrZbK.js";const E={title:"Shared UI/CurrencySelector",component:g,parameters:{layout:"centered",docs:{description:{component:"Display-currency dropdown. Uncontrolled it binds to the currency context;\n it also accepts controlled `currency` / `onCurrencyChange` props."}}}},r={},e={parameters:{currency:"USD"}},o={args:{currency:"EUR",onCurrencyChange:()=>{}}};var t,s,c,n,a;r.parameters={...r.parameters,docs:{...(t=r.parameters)==null?void 0:t.docs,source:{originalSource:"{}",...(c=(s=r.parameters)==null?void 0:s.docs)==null?void 0:c.source},description:{story:"Bound to the context (ILS by default).",...(a=(n=r.parameters)==null?void 0:n.docs)==null?void 0:a.description}}};var p,d,i,u,m;e.parameters={...e.parameters,docs:{...(p=e.parameters)==null?void 0:p.docs,source:{originalSource:`{
  parameters: {
    currency: "USD"
  }
}`,...(i=(d=e.parameters)==null?void 0:d.docs)==null?void 0:i.source},description:{story:"Context set to USD.",...(m=(u=e.parameters)==null?void 0:u.docs)==null?void 0:m.description}}};var l,y,C,S,U;o.parameters={...o.parameters,docs:{...(l=o.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    currency: "EUR",
    onCurrencyChange: () => {}
  }
}`,...(C=(y=o.parameters)==null?void 0:y.docs)==null?void 0:C.source},description:{story:"Controlled to EUR via props.",...(U=(S=o.parameters)==null?void 0:S.docs)==null?void 0:U.description}}};const f=["Default","UsdContext","ControlledEur"];export{o as ControlledEur,r as Default,e as UsdContext,f as __namedExportsOrder,E as default};
