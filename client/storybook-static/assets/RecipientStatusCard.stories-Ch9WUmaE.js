import{B as v,E as x,j as t}from"./iframe-DZ5yRNij.js";import{R as N}from"./RecipientStatusCard-BW2Pq3dy.js";import"./preload-helper-C1FmrZbK.js";import"./Primitives-DzJ49MJc.js";import"./createLucideIcon-WwrtmSrE.js";import"./send-BfpXNUG5.js";import"./badge-check-oIYDNVNe.js";const C={title:"Shared UI/RecipientStatusCard",component:N,parameters:{layout:"centered"},decorators:[g=>t.jsx("div",{style:{width:340},children:t.jsx(g,{})})],args:{relationship:x,viewedName:"Maya Cohen",onSendMoney:()=>{}}},e={},r={args:{relationship:v,viewedName:"Dana Levi"}},s={args:{relationship:{...x,relationshipStatus:"self",canTransferToUser:!1},viewedName:"Test User"}};var a,i,o,n,p;e.parameters={...e.parameters,docs:{...(a=e.parameters)==null?void 0:a.docs,source:{originalSource:"{}",...(o=(i=e.parameters)==null?void 0:i.docs)==null?void 0:o.source},description:{story:"Verified recipient — Transfer button shown.",...(p=(n=e.parameters)==null?void 0:n.docs)==null?void 0:p.description}}};var c,d,m,l,u;r.parameters={...r.parameters,docs:{...(c=r.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    relationship: emptyRelationshipFixture,
    viewedName: "Dana Levi"
  }
}`,...(m=(d=r.parameters)==null?void 0:d.docs)==null?void 0:m.source},description:{story:"Not-yet-verified recipient (transfers still allowed).",...(u=(l=r.parameters)==null?void 0:l.docs)==null?void 0:u.description}}};var f,h,y,S,w;s.parameters={...s.parameters,docs:{...(f=s.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    relationship: {
      ...relationshipFixture,
      relationshipStatus: "self",
      canTransferToUser: false
    },
    viewedName: "Test User"
  }
}`,...(y=(h=s.parameters)==null?void 0:h.docs)==null?void 0:y.source},description:{story:"Viewing your own profile — no transfer action.",...(w=(S=s.parameters)==null?void 0:S.docs)==null?void 0:w.description}}};const E=["Default","NotVerified","Self"];export{e as Default,r as NotVerified,s as Self,E as __namedExportsOrder,C as default};
