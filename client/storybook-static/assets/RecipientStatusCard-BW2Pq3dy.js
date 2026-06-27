import{j as e}from"./iframe-DZ5yRNij.js";import{B as s}from"./Primitives-DzJ49MJc.js";import{S as o}from"./send-BfpXNUG5.js";import{c as n}from"./createLucideIcon-WwrtmSrE.js";import{B as u}from"./badge-check-oIYDNVNe.js";/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",key:"1u773s"}],["path",{d:"M12 17h.01",key:"p32p05"}]],l=n("circle-question-mark",c);/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M17.925 20.056a6 6 0 0 0-11.851.001",key:"z69sun"}],["circle",{cx:"12",cy:"11",r:"4",key:"1gt34v"}],["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],m=n("circle-user-round",d);function p(r,t){return r.relationshipStatus==="self"?{icon:e.jsx(m,{"aria-hidden":"true"}),title:"Your account",message:"You are viewing your own profile. Transfers to yourself are not possible."}:r.isVerifiedRecipient?{icon:e.jsx(u,{"aria-hidden":"true"}),title:"Verified recipient",message:`${t} has a verified account. You can Transfer to this user.`}:{icon:e.jsx(l,{"aria-hidden":"true"}),title:"Not verified yet",message:`${t} has not verified their account yet. Transfers are still possible, but double-check the email before sending.`}}function y({relationship:r,viewedName:t,onSendMoney:a}){const i=p(r,t);return e.jsxs("section",{className:"card recipient-status-card","aria-label":"Recipient status",children:[e.jsxs("div",{className:"recipient-status-head",children:[e.jsx("span",{className:r.isVerifiedRecipient&&r.relationshipStatus!=="self"?"recipient-status-icon recipient-status-icon-verified":"recipient-status-icon",children:i.icon}),e.jsx("h2",{children:i.title})]}),e.jsx("p",{className:"recipient-status-message",children:i.message}),r.canTransferToUser?e.jsxs(s,{type:"button",onClick:a,children:[e.jsx(o,{"aria-hidden":"true",className:"user-profile-action-icon"}),"Transfer"]}):null]})}y.__docgenInfo={description:"",methods:[],displayName:"RecipientStatusCard",props:{relationship:{required:!0,tsType:{name:"signature",type:"object",raw:`{
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
| "verified_recipient"`,elements:[{name:"literal",value:'"self"'},{name:"literal",value:'"no_history"'},{name:"literal",value:'"has_history"'},{name:"literal",value:'"verified_recipient"'}],required:!0}}]}},description:""},viewedName:{required:!0,tsType:{name:"string"},description:""},onSendMoney:{required:!0,tsType:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}}},description:""}}};export{y as R};
