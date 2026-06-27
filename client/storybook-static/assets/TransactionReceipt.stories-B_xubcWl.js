import{T}from"./TransactionReceipt-4H0SZ_UW.js";import{t as F,f as C}from"./iframe-DZ5yRNij.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./proxy-BzfIBfh9.js";import"./arrow-up-right-C6nhnR0P.js";import"./createLucideIcon-WwrtmSrE.js";import"./preload-helper-C1FmrZbK.js";const _={title:"Transactions/TransactionReceipt",component:T,parameters:{layout:"fullscreen",docs:{description:{component:"The printed receipt for a single cleared transaction. Read-only; `onClose`\n just dismisses the surface."}}},args:{onClose:()=>{}}},r={args:{transaction:F[0]}},e={args:{transaction:F[1]}},s={args:{transaction:C}};var t,a,o,n,i;r.parameters={...r.parameters,docs:{...(t=r.parameters)==null?void 0:t.docs,source:{originalSource:`{
  args: {
    transaction: transactionsFixture[0]
  }
}`,...(o=(a=r.parameters)==null?void 0:a.docs)==null?void 0:o.source},description:{story:'Money sent (debit): "Paid" stamp.',...(i=(n=r.parameters)==null?void 0:n.docs)==null?void 0:i.description}}};var c,p,d,m,u;e.parameters={...e.parameters,docs:{...(c=e.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    transaction: transactionsFixture[1]
  }
}`,...(d=(p=e.parameters)==null?void 0:p.docs)==null?void 0:d.source},description:{story:'Money received (credit): "Received" stamp.',...(u=(m=e.parameters)==null?void 0:m.docs)==null?void 0:u.description}}};var l,g,f,y,x;s.parameters={...s.parameters,docs:{...(l=s.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    transaction: fxTransactionFixture
  }
}`,...(f=(g=s.parameters)==null?void 0:g.docs)==null?void 0:f.source},description:{story:'A transfer entered in a foreign currency — shows the "Entered as" row.',...(x=(y=s.parameters)==null?void 0:y.docs)==null?void 0:x.description}}};const b=["Default","Credit","ForeignCurrency"];export{e as Credit,r as Default,s as ForeignCurrency,b as __namedExportsOrder,_ as default};
