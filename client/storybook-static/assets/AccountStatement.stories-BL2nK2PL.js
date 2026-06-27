import{A as i}from"./AccountStatement-BRMrrvBL.js";import{v as u,x as d}from"./iframe-DZ5yRNij.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./Primitives-DzJ49MJc.js";import"./createLucideIcon-WwrtmSrE.js";import"./preload-helper-C1FmrZbK.js";const A={title:"Dashboard/AccountStatement",component:i,parameters:{layout:"padded"},args:{summary:u,holderName:"Test User",accountNumber:"•••• 4821",formatAmount:d,onSelectTransaction:()=>{}}},t={},r={args:{summary:{...u,transactions:[],balance:0}}};var a,e,o;t.parameters={...t.parameters,docs:{...(a=t.parameters)==null?void 0:a.docs,source:{originalSource:"{}",...(o=(e=t.parameters)==null?void 0:e.docs)==null?void 0:o.source}}};var s,m,n,c,p;r.parameters={...r.parameters,docs:{...(s=r.parameters)==null?void 0:s.docs,source:{originalSource:`{
  args: {
    summary: {
      ...accountSummaryFixture,
      transactions: [],
      balance: 0
    }
  }
}`,...(n=(m=r.parameters)==null?void 0:m.docs)==null?void 0:n.source},description:{story:"No ledger entries — the statement's empty state.",...(p=(c=r.parameters)==null?void 0:c.docs)==null?void 0:p.description}}};const h=["Default","Empty"];export{t as Default,r as Empty,h as __namedExportsOrder,A as default};
