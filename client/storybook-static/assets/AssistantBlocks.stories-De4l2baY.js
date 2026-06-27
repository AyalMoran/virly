import{K as lt,j as p}from"./iframe-DZ5yRNij.js";import{a as ut}from"./AssistantBlocks-DwBr0s9k.js";import"./preload-helper-C1FmrZbK.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./utils-DCADjnpI.js";import"./createLucideIcon-WwrtmSrE.js";import"./check-x2dPxJ_p.js";import"./arrow-up-right-C6nhnR0P.js";const pt=[{id:"atx_0001",direction:"sent",counterpartyName:"Maya Cohen",counterpartyEmail:"maya.cohen@virly.test",amount:{amount:250,currency:"ILS",formatted:"₪250.00"},status:"completed",createdAt:"2026-06-20T18:30:00.000Z",description:"Dinner split"},{id:"atx_0002",direction:"received",counterpartyName:"Acme Payroll",counterpartyEmail:"payroll@acme.test",amount:{amount:1200,currency:"ILS",formatted:"₪1,200.00"},status:"completed",createdAt:"2026-06-19T08:00:00.000Z",description:"June salary"}],ft=[{id:"pt_0001",recipientLabel:"Maya Cohen (maya.cohen@virly.test)",recipientEmailMasked:"m***@virly.test",amount:{amount:250,currency:"ILS",formatted:"₪250.00"},reason:"Dinner split",status:"pending",expiresAt:"2099-12-31T23:59:59.000Z",conversationId:"conv_test_0001"}],yt={id:"blk_text",type:"text",title:{text:"Here's what I found",dir:"ltr"},text:{text:"Your current balance is ₪1,250.00. You can send money or review recent activity from here.",dir:"ltr"}},ct={id:"blk_account",type:"account_summary",title:{text:"Account summary",dir:"ltr"},accountLabel:{text:"Primary account",dir:"ltr"},availableBalance:{amount:1250,currency:"ILS",formatted:"₪1,250.00"}},mt={id:"blk_txn_list",type:"transaction_list",title:{text:"Recent transactions",dir:"ltr"},subtitle:{text:"Last 2 of 142",dir:"ltr"},transactions:pt,summary:{totalCount:142}},o={id:"blk_confirm",type:"transfer_confirmation",title:{text:"Please confirm this transfer",dir:"ltr"},confirmation:lt},gt={id:"blk_pending",type:"pending_transfers",title:{text:"Pending transfers awaiting your confirmation",dir:"ltr"},pendingTransfers:ft,summary:{totalCount:1}},kt={id:"blk_quote",type:"transfer_quote",title:{text:"Transfer quote",dir:"ltr"},eligible:!0,recipientLabel:"Maya Cohen",amount:{amount:250,currency:"ILS",formatted:"₪250.00"},currentBalance:{amount:1250,currency:"ILS",formatted:"₪1,250.00"},remainingBalanceAfterTransfer:{amount:1e3,currency:"ILS",formatted:"₪1,000.00"},dailyRemaining:{amount:4750,currency:"ILS",formatted:"₪4,750.00"},warnings:["This is the first time you send money to Maya."]},bt={id:"blk_notice",type:"notice",title:{text:"Heads up",dir:"ltr"},tone:"warning",message:{text:"I can prepare a transfer, but you always confirm it yourself before any money moves.",dir:"ltr"}},St={id:"blk_empty",type:"empty_state",title:{text:"Nothing to show yet",dir:"ltr"},message:{text:"You have no transactions with this person yet.",dir:"ltr"}},Tt=[yt,ct,mt],Et={title:"AI Assistant/AssistantBlocks",component:ut,parameters:{layout:"padded",docs:{description:{component:"The assistant's structured response surface. Every state here is read-only or\na *prepared* action: the transfer_confirmation block always asks the user to\nconfirm/deny — the assistant never moves money on its own. `onConfirmTransfer`\n/ `onDenyTransfer` are inert no-ops in the catalog."}}},decorators:[dt=>p.jsx("div",{style:{maxWidth:380,width:"100%"},children:p.jsx(dt,{})})],args:{blocks:Tt,locale:"en-US",onConfirmTransfer:()=>{},onDenyTransfer:()=>{}}},t={},i={args:{blocks:[ct]}},c={args:{blocks:[mt]}},m={args:{blocks:[gt]}},d={args:{blocks:[kt]}},l={args:{blocks:[bt]}},u={args:{blocks:[St]}},r={args:{blocks:[o],confirmationStatus:"pending"}},e={args:{blocks:[o],confirmationStatus:"confirming"}},s={args:{blocks:[o],confirmationStatus:"confirmed"}},a={args:{blocks:[o],confirmationStatus:"denied"}},n={args:{blocks:[o],confirmationStatus:"failed"}};var f,y,g,k,b;t.parameters={...t.parameters,docs:{...(f=t.parameters)==null?void 0:f.docs,source:{originalSource:"{}",...(g=(y=t.parameters)==null?void 0:y.docs)==null?void 0:g.source},description:{story:"A typical multi-block answer (text + account summary + recent transactions).",...(b=(k=t.parameters)==null?void 0:k.docs)==null?void 0:b.description}}};var S,T,h;i.parameters={...i.parameters,docs:{...(S=i.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    blocks: [assistantAccountSummaryBlock]
  }
}`,...(h=(T=i.parameters)==null?void 0:T.docs)==null?void 0:h.source}}};var x,C,B;c.parameters={...c.parameters,docs:{...(x=c.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    blocks: [assistantTransactionListBlock]
  }
}`,...(B=(C=c.parameters)==null?void 0:C.docs)==null?void 0:B.source}}};var _,L,v;m.parameters={...m.parameters,docs:{...(_=m.parameters)==null?void 0:_.docs,source:{originalSource:`{
  args: {
    blocks: [assistantPendingTransfersBlock]
  }
}`,...(v=(L=m.parameters)==null?void 0:L.docs)==null?void 0:v.source}}};var A,w,E;d.parameters={...d.parameters,docs:{...(A=d.parameters)==null?void 0:A.docs,source:{originalSource:`{
  args: {
    blocks: [assistantTransferQuoteBlock]
  }
}`,...(E=(w=d.parameters)==null?void 0:w.docs)==null?void 0:E.source}}};var I,P,D;l.parameters={...l.parameters,docs:{...(I=l.parameters)==null?void 0:I.docs,source:{originalSource:`{
  args: {
    blocks: [assistantNoticeBlock]
  }
}`,...(D=(P=l.parameters)==null?void 0:P.docs)==null?void 0:D.source}}};var N,M,j;u.parameters={...u.parameters,docs:{...(N=u.parameters)==null?void 0:N.docs,source:{originalSource:`{
  args: {
    blocks: [assistantEmptyStateBlock]
  }
}`,...(j=(M=u.parameters)==null?void 0:M.docs)==null?void 0:j.source}}};var Q,q,R,Y,Z;r.parameters={...r.parameters,docs:{...(Q=r.parameters)==null?void 0:Q.docs,source:{originalSource:`{
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "pending"
  }
}`,...(R=(q=r.parameters)==null?void 0:q.docs)==null?void 0:R.source},description:{story:"Suggested transfer awaiting the user's confirmation — Confirm/Deny enabled.",...(Z=(Y=r.parameters)==null?void 0:Y.docs)==null?void 0:Z.description}}};var H,F,J,K,O;e.parameters={...e.parameters,docs:{...(H=e.parameters)==null?void 0:H.docs,source:{originalSource:`{
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "confirming"
  }
}`,...(J=(F=e.parameters)==null?void 0:F.docs)==null?void 0:J.source},description:{story:'The user pressed Confirm; the action is in flight ("Sending"), buttons locked.',...(O=(K=e.parameters)==null?void 0:K.docs)==null?void 0:O.description}}};var U,W,z,G,V;s.parameters={...s.parameters,docs:{...(U=s.parameters)==null?void 0:U.docs,source:{originalSource:`{
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "confirmed"
  }
}`,...(z=(W=s.parameters)==null?void 0:W.docs)==null?void 0:z.source},description:{story:"Confirmed by the user.",...(V=(G=s.parameters)==null?void 0:G.docs)==null?void 0:V.description}}};var X,$,tt,rt,et;a.parameters={...a.parameters,docs:{...(X=a.parameters)==null?void 0:X.docs,source:{originalSource:`{
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "denied"
  }
}`,...(tt=($=a.parameters)==null?void 0:$.docs)==null?void 0:tt.source},description:{story:"Denied by the user.",...(et=(rt=a.parameters)==null?void 0:rt.docs)==null?void 0:et.description}}};var st,at,nt,ot,it;n.parameters={...n.parameters,docs:{...(st=n.parameters)==null?void 0:st.docs,source:{originalSource:`{
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "failed"
  }
}`,...(nt=(at=n.parameters)==null?void 0:at.docs)==null?void 0:nt.source},description:{story:"The confirmation failed and needs a retry.",...(it=(ot=n.parameters)==null?void 0:ot.docs)==null?void 0:it.description}}};const It=["Default","AccountSummary","TransactionList","PendingTransfers","TransferQuote","Notice","Empty","ConfirmationPending","ConfirmationSending","ConfirmationConfirmed","ConfirmationDenied","Error"];export{i as AccountSummary,s as ConfirmationConfirmed,a as ConfirmationDenied,r as ConfirmationPending,e as ConfirmationSending,t as Default,u as Empty,n as Error,l as Notice,m as PendingTransfers,c as TransactionList,d as TransferQuote,It as __namedExportsOrder,Et as default};
