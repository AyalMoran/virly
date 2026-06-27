import{u as i,j as e,o as l}from"./iframe-DZ5yRNij.js";import{a as o,A as d}from"./arrow-up-right-C6nhnR0P.js";import{c}from"./createLucideIcon-WwrtmSrE.js";/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=[["path",{d:"M12 3v18",key:"108xh3"}],["path",{d:"m19 8 3 8a5 5 0 0 1-6 0zV7",key:"zcdpyk"}],["path",{d:"M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1",key:"1yorad"}],["path",{d:"m5 8 3 8a5 5 0 0 1-6 0zV7",key:"eua70x"}],["path",{d:"M7 21h10",key:"1b0cd5"}]],m=c("scale",u);function h({relationship:a,viewedName:s}){const{formatAmount:n}=i(),t=a.netAmount,r=t>0?"Net sent":t<0?"Net received":"Even";return e.jsxs("section",{className:"card","aria-label":`Activity between you and ${s}`,children:[e.jsx("div",{className:"section-heading",children:e.jsxs("h2",{children:["Between you and ",s]})}),e.jsxs("div",{className:"relationship-stats-grid",children:[e.jsxs("div",{className:"relationship-stat",children:[e.jsx("span",{className:"relationship-stat-icon direction-mark direction-out","aria-hidden":"true",children:e.jsx(o,{})}),e.jsx("span",{className:"relationship-stat-label",children:"You sent"}),e.jsx("strong",{className:"relationship-stat-value",children:n(a.totalSentToUser)})]}),e.jsxs("div",{className:"relationship-stat",children:[e.jsx("span",{className:"relationship-stat-icon direction-mark direction-in","aria-hidden":"true",children:e.jsx(d,{})}),e.jsx("span",{className:"relationship-stat-label",children:"You received"}),e.jsx("strong",{className:"relationship-stat-value",children:n(a.totalReceivedFromUser)})]}),e.jsxs("div",{className:"relationship-stat",children:[e.jsx("span",{className:"relationship-stat-icon direction-mark","aria-hidden":"true",children:e.jsx(m,{})}),e.jsx("span",{className:"relationship-stat-label",children:r}),e.jsx("strong",{className:"relationship-stat-value",children:n(Math.abs(t))})]})]}),e.jsxs("dl",{className:"relationship-meta-list",children:[e.jsxs("div",{children:[e.jsx("dt",{children:"Transactions"}),e.jsx("dd",{children:a.transactionCount})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Last interaction"}),e.jsx("dd",{children:a.lastTransactionAt?l(a.lastTransactionAt):"No transactions yet"})]})]})]})}h.__docgenInfo={description:"",methods:[],displayName:"RelationshipSummaryCard",props:{relationship:{required:!0,tsType:{name:"signature",type:"object",raw:`{
  viewerUserId: string;
  viewedUserId: string;
  totalSentToUser: number;
  totalReceivedFromUser: number;
  netAmount: number;
  transactionCount: number;
  lastTransactionAt: string | null;
  isVerifiedRecipient: boolean;
  canTransferToUser: boolean;
  relationshipStatus: RelationshipStatus;
}`,signature:{properties:[{key:"viewerUserId",value:{name:"string",required:!0}},{key:"viewedUserId",value:{name:"string",required:!0}},{key:"totalSentToUser",value:{name:"number",required:!0}},{key:"totalReceivedFromUser",value:{name:"number",required:!0}},{key:"netAmount",value:{name:"number",required:!0}},{key:"transactionCount",value:{name:"number",required:!0}},{key:"lastTransactionAt",value:{name:"union",raw:"string | null",elements:[{name:"string"},{name:"null"}],required:!0}},{key:"isVerifiedRecipient",value:{name:"boolean",required:!0}},{key:"canTransferToUser",value:{name:"boolean",required:!0}},{key:"relationshipStatus",value:{name:"union",raw:`| "self"
| "no_history"
| "has_history"
| "verified_recipient"`,elements:[{name:"literal",value:'"self"'},{name:"literal",value:'"no_history"'},{name:"literal",value:'"has_history"'},{name:"literal",value:'"verified_recipient"'}],required:!0}}]}},description:""},viewedName:{required:!0,tsType:{name:"string"},description:""}}};export{h as R};
