import{j as e}from"./iframe-DZ5yRNij.js";import{L as x}from"./index-D3pstTQV.js";import{E as k}from"./Primitives-DzJ49MJc.js";const w=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"}),o=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"});function v(s){return s?w.format(new Date(s)):"—"}function D({summary:s,holderName:j,accountNumber:b,formatAmount:a,onSelectTransaction:N}){var y;const u=s.balance,t=[...s.transactions].sort((n,r)=>{const l=n.date?Date.parse(n.date):0;return(r.date?Date.parse(r.date):0)-l});let m=0,d=0;for(const n of t)n.amount>=0?m+=n.amount:d+=Math.abs(n.amount);let p=0;const g=t.map(n=>{const r=Number((u-p).toFixed(2));return p+=n.amount,r}),f=Number((u-(m-d)).toFixed(2)),i=t.filter(n=>n.date),h=i.length?`${o.format(new Date(i[i.length-1].date))} – ${o.format(new Date(i[0].date))}`:null,q=o.format(new Date(((y=i[0])==null?void 0:y.date)??Date.now()));return e.jsxs("section",{className:"statement","aria-label":"Account statement",children:[e.jsx("span",{className:"statement-flourish","aria-hidden":"true"}),e.jsxs("header",{className:"statement-masthead",children:[e.jsxs("div",{className:"statement-brand",children:[e.jsx("span",{className:"statement-logo","aria-hidden":"true",children:"V"}),e.jsxs("span",{className:"statement-brandname",children:["Virly",e.jsx("small",{children:"Savings & Trust"})]})]}),e.jsxs("div",{className:"statement-meta",children:[e.jsx("span",{className:"statement-doc",children:"Account Statement"}),e.jsxs("span",{className:"statement-metaline",children:["Holder · ",j]}),e.jsxs("span",{className:"statement-metaline",children:["Account · ",b]}),h?e.jsxs("span",{className:"statement-metaline",children:["Period · ",h]}):null]})]}),e.jsx("div",{className:"statement-rule","aria-hidden":"true"}),e.jsxs("div",{className:"statement-summary",children:[e.jsxs("div",{className:"statement-closing",children:[e.jsx("span",{className:"statement-microlabel",children:"Closing balance"}),e.jsx("strong",{children:a(u)}),e.jsxs("span",{className:"statement-asof",children:["as of ",q]})]}),e.jsxs("div",{className:"statement-figures",children:[e.jsxs("div",{children:[e.jsx("span",{children:"Brought forward"}),e.jsx("strong",{children:a(f)})]}),e.jsxs("div",{className:"is-in",children:[e.jsx("span",{children:"Money in"}),e.jsxs("strong",{children:["+",a(m)]})]}),e.jsxs("div",{className:"is-out",children:[e.jsx("span",{children:"Money out"}),e.jsxs("strong",{children:["−",a(d)]})]})]})]}),e.jsx("div",{className:"statement-rule","aria-hidden":"true"}),t.length?e.jsxs("div",{className:"statement-ledger",children:[e.jsxs("div",{className:"statement-ledger-head","aria-hidden":"true",children:[e.jsx("span",{className:"statement-cell-date",children:"Date"}),e.jsx("span",{className:"statement-cell-desc",children:"Description"}),e.jsx("span",{className:"statement-col-out",children:"Paid out"}),e.jsx("span",{className:"statement-col-in",children:"Paid in"}),e.jsx("span",{className:"statement-cell-bal",children:"Balance"})]}),t.map((n,r)=>{const l=n.amount>=0,c=Math.abs(n.amount);return e.jsxs("button",{type:"button",className:"statement-line",onClick:()=>N(n),"aria-label":`${v(n.date)}, ${n.counterpartyEmail}, ${l?"received":"sent"} ${a(c)}, balance ${a(g[r])}`,children:[e.jsx("span",{className:"statement-cell-date",children:v(n.date)}),e.jsxs("span",{className:"statement-cell-desc",children:[e.jsx("strong",{children:n.counterpartyEmail}),n.reason?e.jsx("small",{children:n.reason}):null]}),e.jsxs("span",{className:`statement-cell-amount ${l?"is-in":"is-out"}`,children:[l?"+":"−",a(c)]}),e.jsx("span",{className:"statement-cell-bal",children:a(g[r])})]},n.id)})]}):e.jsx(k,{title:"No transactions on this statement",message:"Money you send or receive will appear here as ledger entries.",children:e.jsx(x,{className:"button button-primary",to:"/transfer",children:"Make a transfer"})}),e.jsx("div",{className:"statement-rule statement-rule-end","aria-hidden":"true"}),e.jsxs("footer",{className:"statement-foot",children:[e.jsxs("span",{children:["End of statement · ",t.length," ",t.length===1?"entry":"entries"]}),e.jsx(x,{to:"/transactions",className:"statement-viewall",children:"View all transactions"})]})]})}D.__docgenInfo={description:"",methods:[],displayName:"AccountStatement",props:{summary:{required:!0,tsType:{name:"signature",type:"object",raw:`{
  balance: number;
  personalDetails: {
    id: string;
    status: PersonalDetailsStatus;
    firstName: string | null;
    needsPersonalDetails: boolean;
  };
  transactions: Transaction[];
  pagination: Pagination;
}`,signature:{properties:[{key:"balance",value:{name:"number",required:!0}},{key:"personalDetails",value:{name:"signature",type:"object",raw:`{
  id: string;
  status: PersonalDetailsStatus;
  firstName: string | null;
  needsPersonalDetails: boolean;
}`,signature:{properties:[{key:"id",value:{name:"string",required:!0}},{key:"status",value:{name:"union",raw:'"not_provided" | "provided"',elements:[{name:"literal",value:'"not_provided"'},{name:"literal",value:'"provided"'}],required:!0}},{key:"firstName",value:{name:"union",raw:"string | null",elements:[{name:"string"},{name:"null"}],required:!0}},{key:"needsPersonalDetails",value:{name:"boolean",required:!0}}]},required:!0}},{key:"transactions",value:{name:"Array",elements:[{name:"signature",type:"object",raw:`{
  id: string;
  amount: number;
  counterpartyEmail: string;
  reason?: string | null;
  date?: string;
  fx?: TransactionFxMetadata;
}`,signature:{properties:[{key:"id",value:{name:"string",required:!0}},{key:"amount",value:{name:"number",required:!0}},{key:"counterpartyEmail",value:{name:"string",required:!0}},{key:"reason",value:{name:"union",raw:"string | null",elements:[{name:"string"},{name:"null"}],required:!1}},{key:"date",value:{name:"string",required:!1}},{key:"fx",value:{name:"signature",type:"object",raw:`{
  enteredCurrency: DisplayCurrency;
  enteredAmount?: number;
  exchangeRateUsed?: number;
  exchangeRateFetchedAt?: string;
}`,signature:{properties:[{key:"enteredCurrency",value:{name:"union",raw:'"ILS" | "USD" | "EUR"',elements:[{name:"literal",value:'"ILS"'},{name:"literal",value:'"USD"'},{name:"literal",value:'"EUR"'}],required:!0}},{key:"enteredAmount",value:{name:"number",required:!1}},{key:"exchangeRateUsed",value:{name:"number",required:!1}},{key:"exchangeRateFetchedAt",value:{name:"string",required:!1}}]},required:!1}}]}}],raw:"Transaction[]",required:!0}},{key:"pagination",value:{name:"signature",type:"object",raw:`{
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}`,signature:{properties:[{key:"page",value:{name:"number",required:!0}},{key:"limit",value:{name:"number",required:!0}},{key:"total",value:{name:"number",required:!0}},{key:"totalPages",value:{name:"number",required:!0}}]},required:!0}}]}},description:""},holderName:{required:!0,tsType:{name:"string"},description:""},accountNumber:{required:!0,tsType:{name:"string"},description:""},formatAmount:{required:!0,tsType:{name:"signature",type:"function",raw:"(amountIls: number) => string",signature:{arguments:[{type:{name:"number"},name:"amountIls"}],return:{name:"string"}}},description:""},onSelectTransaction:{required:!0,tsType:{name:"signature",type:"function",raw:"(transaction: Transaction) => void",signature:{arguments:[{type:{name:"signature",type:"object",raw:`{
  id: string;
  amount: number;
  counterpartyEmail: string;
  reason?: string | null;
  date?: string;
  fx?: TransactionFxMetadata;
}`,signature:{properties:[{key:"id",value:{name:"string",required:!0}},{key:"amount",value:{name:"number",required:!0}},{key:"counterpartyEmail",value:{name:"string",required:!0}},{key:"reason",value:{name:"union",raw:"string | null",elements:[{name:"string"},{name:"null"}],required:!1}},{key:"date",value:{name:"string",required:!1}},{key:"fx",value:{name:"signature",type:"object",raw:`{
  enteredCurrency: DisplayCurrency;
  enteredAmount?: number;
  exchangeRateUsed?: number;
  exchangeRateFetchedAt?: string;
}`,signature:{properties:[{key:"enteredCurrency",value:{name:"union",raw:'"ILS" | "USD" | "EUR"',elements:[{name:"literal",value:'"ILS"'},{name:"literal",value:'"USD"'},{name:"literal",value:'"EUR"'}],required:!0}},{key:"enteredAmount",value:{name:"number",required:!1}},{key:"exchangeRateUsed",value:{name:"number",required:!1}},{key:"exchangeRateFetchedAt",value:{name:"string",required:!1}}]},required:!1}}]}},name:"transaction"}],return:{name:"void"}}},description:""}}};export{D as A};
