import{T as A}from"./TransactionList-ZahCuaCf.js";import{e as N,m as O,p as R,t as k}from"./iframe-DZ5yRNij.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./Primitives-DzJ49MJc.js";import"./createLucideIcon-WwrtmSrE.js";import"./arrow-up-right-C6nhnR0P.js";import"./preload-helper-C1FmrZbK.js";const Q={title:"Transactions/TransactionList",component:A,parameters:{layout:"padded"},args:{transactions:k}},o={},a={args:{transactions:N}},e={args:{compact:!0}},r={args:{onTransactionSelect:()=>{}}},s={args:{pagination:R,page:1,onPageChange:()=>{}}},t={args:{pagination:O,page:3,onPageChange:()=>{}}};var n,i,c;o.parameters={...o.parameters,docs:{...(n=o.parameters)==null?void 0:n.docs,source:{originalSource:"{}",...(c=(i=o.parameters)==null?void 0:i.docs)==null?void 0:c.source}}};var p,m,g,d,u;a.parameters={...a.parameters,docs:{...(p=a.parameters)==null?void 0:p.docs,source:{originalSource:`{
  args: {
    transactions: emptyTransactionsFixture
  }
}`,...(g=(m=a.parameters)==null?void 0:m.docs)==null?void 0:g.source},description:{story:'No transactions yet — renders the EmptyState with a "Transfer" CTA.',...(u=(d=a.parameters)==null?void 0:d.docs)==null?void 0:u.description}}};var l,y,h,P,S;e.parameters={...e.parameters,docs:{...(l=e.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    compact: true
  }
}`,...(h=(y=e.parameters)==null?void 0:y.docs)==null?void 0:h.source},description:{story:"Dense variant used inside narrower surfaces (e.g. the dashboard).",...(S=(P=e.parameters)==null?void 0:P.docs)==null?void 0:S.description}}};var T,x,f,C,F;r.parameters={...r.parameters,docs:{...(T=r.parameters)==null?void 0:T.docs,source:{originalSource:`{
  args: {
    onTransactionSelect: () => {}
  }
}`,...(f=(x=r.parameters)==null?void 0:x.docs)==null?void 0:f.source},description:{story:"Rows become buttons that emit `onTransactionSelect`.",...(F=(C=r.parameters)==null?void 0:C.docs)==null?void 0:F.description}}};var b,w,E,D,M;s.parameters={...s.parameters,docs:{...(b=s.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    pagination: paginationFixture,
    page: 1,
    onPageChange: () => {}
  }
}`,...(E=(w=s.parameters)==null?void 0:w.docs)==null?void 0:E.source},description:{story:"Single page of results still hides the pager (totalPages = 1).",...(M=(D=s.parameters)==null?void 0:D.docs)==null?void 0:M.description}}};var L,W,_,j,v;t.parameters={...t.parameters,docs:{...(L=t.parameters)==null?void 0:L.docs,source:{originalSource:`{
  args: {
    pagination: manyPagesPaginationFixture,
    page: 3,
    onPageChange: () => {}
  }
}`,...(_=(W=t.parameters)==null?void 0:W.docs)==null?void 0:_.source},description:{story:"Many pages: windowed page buttons, ellipses, and the jump input.",...(v=(j=t.parameters)==null?void 0:j.docs)==null?void 0:v.description}}};const U=["Default","Empty","Compact","Selectable","WithPagination","ManyPages"];export{e as Compact,o as Default,a as Empty,t as ManyPages,r as Selectable,s as WithPagination,U as __namedExportsOrder,Q as default};
