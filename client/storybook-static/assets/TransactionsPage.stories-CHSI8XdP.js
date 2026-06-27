import{r as a,A as W,j as t,O as d,P as f,Q as g,X,Y}from"./iframe-DZ5yRNij.js";import{c as $,P as q,C as R,F as z,B as w,a as G,S as J}from"./Primitives-DzJ49MJc.js";import{T as K}from"./TransactionDetailsDialog-ZcroWAeW.js";import{T as Z}from"./TransactionList-ZahCuaCf.js";import{a as tt}from"./validation-BebyThp4.js";import{d as at}from"./delay-tbEf_91R.js";import"./preload-helper-C1FmrZbK.js";import"./createLucideIcon-WwrtmSrE.js";import"./TransactionReceipt-4H0SZ_UW.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./proxy-BzfIBfh9.js";import"./arrow-up-right-C6nhnR0P.js";import"./index-CKnVyPAM.js";function A(){const[r,I]=a.useState(null),[l,m]=a.useState(1),[n,y]=a.useState(""),[h,x]=a.useState(""),[j,S]=a.useState(""),[N,u]=a.useState(""),[O,E]=a.useState(!0),[M,T]=a.useState(null);a.useEffect(()=>{let e=!0;return E(!0),W.transactions({page:l,limit:10,counterparty:h}).then(s=>{e&&(I(s),S(""))}).catch(s=>{e&&S(s instanceof Error?s.message:"Unable to load transactions.")}).finally(()=>{e&&E(!1)}),()=>{e=!1}},[h,l]);function Q(e){if(e.preventDefault(),n.trim()){const s=tt(n);if(s){u(s);return}}u(""),m(1),x(n.trim())}function V(){y(""),x(""),u(""),m(1)}return t.jsxs($,{children:[t.jsx(q,{eyebrow:"",title:"Transactions"}),t.jsx(R,{children:t.jsxs("form",{className:"filter-bar",onSubmit:Q,noValidate:!0,children:[t.jsx(z,{label:"Counterparty email",name:"counterparty",type:"email",value:n,error:N,placeholder:"name@example.com",onChange:e=>y(e.target.value)}),t.jsx(w,{type:"submit",children:"Filter"}),t.jsx(w,{type:"button",variant:"secondary",onClick:V,children:"Reset"})]})}),j?t.jsx(G,{message:j}):null,t.jsx(R,{children:O?t.jsx(J,{rows:6}):t.jsx(Z,{transactions:(r==null?void 0:r.transactions)??[],pagination:r==null?void 0:r.pagination,page:l,onPageChange:m,onTransactionSelect:T})}),t.jsx(K,{transaction:M,onClose:()=>T(null)})]})}A.__docgenInfo={description:"",methods:[],displayName:"TransactionsPage"};const yt={title:"Transactions/TransactionsPage",component:A,parameters:{layout:"fullscreen",docs:{description:{component:`The transactions list page (filter + paginated list + details dialog).
 Data is mocked per-story via MSW.`}}}},o={},i={parameters:{msw:{handlers:[f.get("*/api/transactions",async()=>(await at("infinite"),g.json(Y))),...d]}}},c={parameters:{msw:{handlers:[f.get("*/api/transactions",()=>g.json(X)),...d]}}},p={parameters:{msw:{handlers:[f.get("*/api/transactions",()=>g.json({message:"Unable to load transactions."},{status:500})),...d]}}};var C,F,b;o.parameters={...o.parameters,docs:{...(C=o.parameters)==null?void 0:C.docs,source:{originalSource:"{}",...(b=(F=o.parameters)==null?void 0:F.docs)==null?void 0:b.source}}};var v,H,P;i.parameters={...i.parameters,docs:{...(v=i.parameters)==null?void 0:v.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/transactions", async () => {
        await delay("infinite");
        return HttpResponse.json(transactionsResponseFixture);
      }), ...defaultHandlers]
    }
  }
}`,...(P=(H=i.parameters)==null?void 0:H.docs)==null?void 0:P.source}}};var D,L,k;c.parameters={...c.parameters,docs:{...(D=c.parameters)==null?void 0:D.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/transactions", () => HttpResponse.json(emptyTransactionsResponseFixture)), ...defaultHandlers]
    }
  }
}`,...(k=(L=c.parameters)==null?void 0:L.docs)==null?void 0:k.source}}};var _,B,U;p.parameters={...p.parameters,docs:{...(_=p.parameters)==null?void 0:_.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/transactions", () => HttpResponse.json({
        message: "Unable to load transactions."
      }, {
        status: 500
      })), ...defaultHandlers]
    }
  }
}`,...(U=(B=p.parameters)==null?void 0:B.docs)==null?void 0:U.source}}};const ht=["Default","Loading","Empty","Error"];export{o as Default,c as Empty,p as Error,i as Loading,ht as __namedExportsOrder,yt as default};
