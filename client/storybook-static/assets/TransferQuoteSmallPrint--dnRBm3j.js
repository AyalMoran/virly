import{j as n,x as t}from"./iframe-DZ5yRNij.js";function a({quote:e}){if(e.enteredCurrency==="ILS")return null;const r=e.rateValidForDate??(e.rateFetchedAt?e.rateFetchedAt.slice(0,10):"today");return n.jsxs("p",{className:"transfer-quote-small-print",children:["Actual transfer amount: ",t(e.amountIls)," ILS, using"," ",e.enteredCurrency," → ILS rate (",e.rate,") from ",r]})}a.__docgenInfo={description:`Small-print disclosure under a non-ILS transfer confirmation: the actual
ILS ledger amount, the rate used and the rate date. ILS quotes render
nothing — no conversion happens for them.`,methods:[],displayName:"TransferQuoteSmallPrint",props:{quote:{required:!0,tsType:{name:"signature",type:"object",raw:`{
  enteredAmount: number;
  enteredCurrency: DisplayCurrency;
  amountIls: number;
  rate: number;
  rateFetchedAt: string | null;
  rateValidForDate: string | null;
  baseCurrency: "ILS";
  provider: string | null;
}`,signature:{properties:[{key:"enteredAmount",value:{name:"number",required:!0}},{key:"enteredCurrency",value:{name:"union",raw:'"ILS" | "USD" | "EUR"',elements:[{name:"literal",value:'"ILS"'},{name:"literal",value:'"USD"'},{name:"literal",value:'"EUR"'}],required:!0}},{key:"amountIls",value:{name:"number",required:!0}},{key:"rate",value:{name:"number",required:!0}},{key:"rateFetchedAt",value:{name:"union",raw:"string | null",elements:[{name:"string"},{name:"null"}],required:!0}},{key:"rateValidForDate",value:{name:"union",raw:"string | null",elements:[{name:"string"},{name:"null"}],required:!0}},{key:"baseCurrency",value:{name:"literal",value:'"ILS"',required:!0}},{key:"provider",value:{name:"union",raw:"string | null",elements:[{name:"string"},{name:"null"}],required:!0}}]}},description:""}}};export{a as T};
