import{a5 as de,c as me,r as t,A as ue,M as he,j as e,O as h,P as f,Q as y,B as fe,F as ae,a6 as ye,z as xe,E as ge,a3 as je,a4 as Se}from"./iframe-DZ5yRNij.js";import{L as x}from"./index-D3pstTQV.js";import{c as g,P as j,S as we,C as R,E as be,a as ve,B as Ee,R as Ne}from"./Primitives-DzJ49MJc.js";import{E as Re}from"./EmptyRelationshipState-CAtE4K7D.js";import{R as Pe}from"./RecentRelationshipTransactions-Bj6j3-eH.js";import{R as Ue}from"./RecipientStatusCard-BW2Pq3dy.js";import{R as Te}from"./RelationshipSummaryCard-DxzbrKIN.js";import{U as He}from"./UserProfileHeader-DXrnZ3HK.js";import{c as ke}from"./createLucideIcon-WwrtmSrE.js";import{d as Fe}from"./delay-tbEf_91R.js";import"./preload-helper-C1FmrZbK.js";import"./index-kMzSCBiS.js";import"./TransactionDetailsDialog-ZcroWAeW.js";import"./TransactionReceipt-4H0SZ_UW.js";import"./proxy-BzfIBfh9.js";import"./arrow-up-right-C6nhnR0P.js";import"./index-CKnVyPAM.js";import"./send-BfpXNUG5.js";import"./badge-check-oIYDNVNe.js";import"./user-avatar-_R2f97eP.js";/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["line",{x1:"17",x2:"22",y1:"8",y2:"13",key:"3nzzx3"}],["line",{x1:"22",x2:"17",y1:"8",y2:"13",key:"1swrse"}]],Le=ke("user-x",Oe);function te(){const{userId:n=""}=de(),E=me(),[o,ne]=t.useState(null),[S,w]=t.useState(null),[oe,N]=t.useState(!0),[ie,le]=t.useState(0);t.useEffect(()=>{let a=!0;return N(!0),w(null),ue.userProfile(n).then(i=>{a&&ne(i)}).catch(i=>{a&&(i instanceof he?w({status:i.status,message:i.message}):w({status:null,message:"Unable to load this profile."}))}).finally(()=>{a&&N(!1)}),()=>{a=!1}},[n,ie]);const b=t.useCallback(()=>{o&&(sessionStorage.setItem("virly-prefill-recipient",o.user.email),E("/transfer"))},[E,o]);if(oe)return e.jsxs(g,{children:[e.jsx(j,{eyebrow:"Profile",title:"Loading profile"}),e.jsx(we,{rows:4})]});if(S)return S.status===404?e.jsxs(g,{children:[e.jsx(j,{eyebrow:"Profile",title:"User not found"}),e.jsx(R,{children:e.jsx(be,{title:"This profile is not available",message:"The user may not exist or may no longer be available.",icon:e.jsx(Le,{}),children:e.jsx(x,{className:"button button-primary",to:"/transactions",children:"Back to transactions"})})})]}):e.jsxs(g,{children:[e.jsx(j,{eyebrow:"Profile",title:"Profile"}),e.jsx(ve,{message:S.message}),e.jsx("div",{className:"button-row",children:e.jsx(Ee,{type:"button",onClick:()=>le(a=>a+1),children:"Try again"})})]});if(!o)return null;const{user:s,relationship:r,recentTransactions:pe}=o,v=r.relationshipStatus==="self",ce=r.transactionCount>0;return e.jsxs(g,{children:[e.jsx(j,{eyebrow:"Profile",title:s.displayName}),e.jsxs(Ne,{variant:"sidebar",children:[e.jsxs("div",{className:"page-stack",children:[e.jsx(He,{user:s,isSelf:v,canSendMoney:r.canTransferToUser,onSendMoney:b}),v?e.jsxs(R,{children:[e.jsx("div",{className:"section-heading",children:e.jsx("h2",{children:"Your account"})}),e.jsx("p",{className:"user-profile-self-hint",children:"Relationship insights are shown when you visit other users. Manage your own account from these pages instead."}),e.jsxs("div",{className:"button-row",children:[e.jsx(x,{className:"button button-secondary",to:"/dashboard",children:"Account summary"}),e.jsx(x,{className:"button button-secondary",to:"/transactions",children:"Transaction history"}),e.jsx(x,{className:"button button-secondary",to:"/settings",children:"Settings"})]})]}):ce?e.jsxs(e.Fragment,{children:[e.jsx(Te,{relationship:r,viewedName:s.displayName}),e.jsx(Pe,{idOrEmail:n,initialTransactions:pe,totalCount:r.transactionCount,viewedName:s.displayName,viewedEmail:s.email})]}):e.jsx(Re,{viewedName:s.displayName,canSendMoney:r.canTransferToUser,onSendMoney:b})]}),v?null:e.jsx("aside",{className:"page-stack",children:e.jsx(Ue,{relationship:r,viewedName:s.displayName,onSendMoney:b})})]})]})}te.__docgenInfo={description:"",methods:[],displayName:"UserProfilePage"};const ss={title:"Shared UI/UserProfilePage",component:te,parameters:{layout:"fullscreen",router:{initialEntries:["/users/maya.cohen@virly.test"]},docs:{description:{component:"A counterparty profile page (mapped to Shared UI). Reads `:userId` from the\nroute, so a Routes decorator + a `/users/...` initial entry are provided;\nthe profile payload is mocked per-story."}}},decorators:[n=>e.jsx(je,{children:e.jsx(Se,{path:"/users/:userId",element:e.jsx(n,{})})})]},l={},p={parameters:{msw:{handlers:[f.get("*/api/users/:idOrEmail/profile",async()=>(await Fe("infinite"),y.json(ye))),...h]}}},c={parameters:{msw:{handlers:[f.get("*/api/users/:idOrEmail/profile",()=>y.json({user:{...ae,displayName:"Dana Levi"},relationship:fe,recentTransactions:[]})),...h]}}},d={parameters:{msw:{handlers:[f.get("*/api/users/:idOrEmail/profile",()=>y.json({message:"User not found."},{status:404})),...h]}}},m={parameters:{msw:{handlers:[f.get("*/api/users/:idOrEmail/profile",()=>y.json({message:"Unable to load this profile."},{status:500})),...h]}}},u={parameters:{msw:{handlers:[f.get("*/api/users/:idOrEmail/profile",()=>y.json({user:ae,relationship:{...ge,relationshipStatus:"self"},recentTransactions:xe})),...h]}}};var P,U,T,H,k;l.parameters={...l.parameters,docs:{...(P=l.parameters)==null?void 0:P.docs,source:{originalSource:"{}",...(T=(U=l.parameters)==null?void 0:U.docs)==null?void 0:T.source},description:{story:"Verified counterparty with shared history.",...(k=(H=l.parameters)==null?void 0:H.docs)==null?void 0:k.description}}};var F,O,L,C,I;p.parameters={...p.parameters,docs:{...(F=p.parameters)==null?void 0:F.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/users/:idOrEmail/profile", async () => {
        await delay("infinite");
        return HttpResponse.json(userProfileFixture);
      }), ...defaultHandlers]
    }
  }
}`,...(L=(O=p.parameters)==null?void 0:O.docs)==null?void 0:L.source},description:{story:"Profile request never resolves — loading skeleton.",...(I=(C=p.parameters)==null?void 0:C.docs)==null?void 0:I.description}}};var M,_,A,B,D;c.parameters={...c.parameters,docs:{...(M=c.parameters)==null?void 0:M.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/users/:idOrEmail/profile", () => HttpResponse.json({
        user: {
          ...publicUserFixture,
          displayName: "Dana Levi"
        },
        relationship: emptyRelationshipFixture,
        recentTransactions: []
      })), ...defaultHandlers]
    }
  }
}`,...(A=(_=c.parameters)==null?void 0:_.docs)==null?void 0:A.source},description:{story:"No shared history yet — the empty-relationship state.",...(D=(B=c.parameters)==null?void 0:B.docs)==null?void 0:D.description}}};var z,q,K,V,G;d.parameters={...d.parameters,docs:{...(z=d.parameters)==null?void 0:z.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/users/:idOrEmail/profile", () => HttpResponse.json({
        message: "User not found."
      }, {
        status: 404
      })), ...defaultHandlers]
    }
  }
}`,...(K=(q=d.parameters)==null?void 0:q.docs)==null?void 0:K.source},description:{story:'The user does not exist — the 404 "not available" state.',...(G=(V=d.parameters)==null?void 0:V.docs)==null?void 0:G.description}}};var Q,X,Y,J,W;m.parameters={...m.parameters,docs:{...(Q=m.parameters)==null?void 0:Q.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/users/:idOrEmail/profile", () => HttpResponse.json({
        message: "Unable to load this profile."
      }, {
        status: 500
      })), ...defaultHandlers]
    }
  }
}`,...(Y=(X=m.parameters)==null?void 0:X.docs)==null?void 0:Y.source},description:{story:"A non-404 failure — the retry error state.",...(W=(J=m.parameters)==null?void 0:J.docs)==null?void 0:W.description}}};var Z,$,ee,se,re;u.parameters={...u.parameters,docs:{...(Z=u.parameters)==null?void 0:Z.docs,source:{originalSource:`{
  parameters: {
    msw: {
      handlers: [http.get("*/api/users/:idOrEmail/profile", () => HttpResponse.json({
        user: publicUserFixture,
        relationship: {
          ...relationshipFixture,
          relationshipStatus: "self"
        },
        recentTransactions: relationshipTransactionsFixture
      })), ...defaultHandlers]
    }
  }
}`,...(ee=($=u.parameters)==null?void 0:$.docs)==null?void 0:ee.source},description:{story:"Viewing your own profile.",...(re=(se=u.parameters)==null?void 0:se.docs)==null?void 0:re.description}}};const rs=["Default","Loading","Empty","NotFound","Error","Self"];export{l as Default,c as Empty,m as Error,p as Loading,d as NotFound,u as Self,rs as __namedExportsOrder,ss as default};
