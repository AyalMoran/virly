import{T as L}from"./TransferCheque-BmtKQv1d.js";import"./iframe-DZ5yRNij.js";import"./preload-helper-C1FmrZbK.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./proxy-BzfIBfh9.js";const O={title:"Transfers/TransferCheque",component:L,parameters:{layout:"padded",docs:{description:{component:'Virly\'s signature transfer surface, authored around the confirmation gate:\n`form` (pre-confirm, editable) -> `review` (awaiting confirmation, read-only)\n-> `success` (confirmed, "Cleared" stamp). Props only; never executes a\ntransfer.'}}},args:{chequeNumber:"48217",issueDate:"Jun 26, 2026",holderEmail:"test.user@virly.test",currency:"ILS",payee:"maya.cohen@virly.test",recipientEmail:"maya.cohen@virly.test",amount:"250.00",reason:"Dinner split"}},e={args:{mode:"form",recipientEmail:"",amount:"",reason:""}},r={args:{mode:"review"}},a={args:{mode:"success"}},o={args:{mode:"form",recipientEmail:"not-an-email",amount:"0",errors:{recipientEmail:"Enter a valid recipient email.",amount:"Amount must be greater than 0."}}},s={args:{mode:"review",currency:"USD",amount:"125000.00",reason:"Property deposit"}};var t,n,i,c,m;e.parameters={...e.parameters,docs:{...(t=e.parameters)==null?void 0:t.docs,source:{originalSource:`{
  args: {
    mode: "form",
    recipientEmail: "",
    amount: "",
    reason: ""
  }
}`,...(i=(n=e.parameters)==null?void 0:n.docs)==null?void 0:i.source},description:{story:"Pre-confirm: editable cheque (the form step), nothing filled in yet.",...(m=(c=e.parameters)==null?void 0:c.docs)==null?void 0:m.description}}};var d,p,u,l,f;r.parameters={...r.parameters,docs:{...(d=r.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    mode: "review"
  }
}`,...(u=(p=r.parameters)==null?void 0:p.docs)==null?void 0:u.source},description:{story:"Awaiting confirmation: read-only review of the prepared cheque.",...(f=(l=r.parameters)==null?void 0:l.docs)==null?void 0:f.description}}};var g,y,h,v,w;a.parameters={...a.parameters,docs:{...(g=a.parameters)==null?void 0:g.docs,source:{originalSource:`{
  args: {
    mode: "success"
  }
}`,...(h=(y=a.parameters)==null?void 0:y.docs)==null?void 0:h.source},description:{story:'Confirmed: the cleared cheque with its "Cleared" stamp.',...(w=(v=a.parameters)==null?void 0:v.docs)==null?void 0:w.description}}};var E,S,A,q,C;o.parameters={...o.parameters,docs:{...(E=o.parameters)==null?void 0:E.docs,source:{originalSource:`{
  args: {
    mode: "form",
    recipientEmail: "not-an-email",
    amount: "0",
    errors: {
      recipientEmail: "Enter a valid recipient email.",
      amount: "Amount must be greater than 0."
    }
  }
}`,...(A=(S=o.parameters)==null?void 0:S.docs)==null?void 0:A.source},description:{story:"Validation errors surfaced on the editable cheque.",...(C=(q=o.parameters)==null?void 0:q.docs)==null?void 0:C.description}}};var b,D,P,T,x;s.parameters={...s.parameters,docs:{...(b=s.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    mode: "review",
    currency: "USD",
    amount: "125000.00",
    reason: "Property deposit"
  }
}`,...(P=(D=s.parameters)==null?void 0:D.docs)==null?void 0:P.source},description:{story:"A large, foreign-currency review to stress the amount-in-words line.",...(x=(T=s.parameters)==null?void 0:T.docs)==null?void 0:x.description}}};const j=["Default","AwaitingConfirmation","Success","Error","LargeAmount"];export{r as AwaitingConfirmation,e as Default,o as Error,s as LargeAmount,a as Success,j as __namedExportsOrder,O as default};
